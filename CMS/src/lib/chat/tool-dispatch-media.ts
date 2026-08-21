/**
 * generate_image + upload_asset tool handlers (split from `tool-dispatch.ts`).
 * Registered in the shared HANDLERS map in `tool-dispatch.ts`.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateGenerateImage } from "./generate-image-tool";
import { validateUploadAsset } from "./upload-asset-tool";
import { generateImage } from "./generate-image";
import { describeImage } from "./describe-image";
import { withWhiteBackgroundInstruction } from "./cutout";
import { removeBackgroundFromPng } from "./png-cutout";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_GEN_MODEL,
} from "@/lib/chat/models";
import { getAiConfig, effectiveModel } from "@/lib/ai-config";
import { imageDimensionsFromBytes } from "../media/image-dimensions";
import { putAsset, setAssetTags } from "@/db/asset-store";
import { buildAssetKey, assetUrl, filenameFromText, withAssetDims } from "@/lib/render/asset";
import { getImageModel, getImageGenModel } from "@/db/settings-store";
import { meterAiCall } from "@/db/ai-usage-store";
import { aiQuotaSpent, aiQuotaToolError } from "@/lib/ai-quota/guard";
import { waitUntilOrInline } from "@/lib/cf/wait-until";

/**
 * The deployer-injected OpenRouter key from the Worker env, read via the CF
 * context. Returns "" when no key/context — callers treat that as "AI disabled".
 */
async function resolveOpenrouterKey(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { OPENROUTER_API_KEY?: string };
    return typeof e.OPENROUTER_API_KEY === "string" ? e.OPENROUTER_API_KEY.trim() : "";
  } catch {
    return "";
  }
}

/** Base64-encode an ArrayBuffer (Worker-safe; chunked to avoid arg-count limits). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Generate an image from a text prompt and run it through the SAME pipeline an
 * upload uses: write bytes to R2 + a D1 asset row, describe it for search (vision
 * model), and apply the model's tags. Returns the new asset's public `/media/<key>`
 * URL so the assistant can drop it straight into a component/page.
 *
 * Each external step degrades gracefully: a describe failure still yields a usable
 * asset (empty description, like upload); only a generation failure or R2 write
 * error is a hard error the model can recover from.
 */
export async function handleGenerateImage(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateGenerateImage(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };

  // Monthly AI quota (ai-cost-quotas): refuse BEFORE the generation call. A tool
  // error (not an HTTP status) so the model relays it to the operator, like any
  // other recoverable tool failure here.
  const overQuota = await aiQuotaToolError();
  if (overQuota) return overQuota;

  const key = await resolveOpenrouterKey();
  if (!key) {
    return { ok: false, errors: ["no OpenRouter key configured for this site — AI is unavailable"] };
  }

  // The image-GENERATION model. The stored value is a curated alias key (new) or
  // a legacy raw model id — both resolve; no curated config → legacy default.
  const aiConfig = await getAiConfig();
  const genModel = effectiveModel(
    aiConfig,
    "imageGenerate",
    await getImageGenModel(),
    DEFAULT_IMAGE_GEN_MODEL,
  );
  // For a transparent cut-out: tell the model to render on a flat white background
  // (so the flood-fill has a clean key), then strip it after generation below.
  const genPrompt = valid.transparentBackground
    ? withWhiteBackgroundInstruction(valid.prompt)
    : valid.prompt;
  let image;
  try {
    const generated = await generateImage(genPrompt, genModel, key);
    // Meter what the provider charged even when the reply carried no usable
    // image — we were billed either way. Under waitUntil: a merely-dangling
    // promise is cancelled when the response settles (ai-cost-quotas).
    waitUntilOrInline(meterAiCall("imageGenerate", genModel, generated.cost).catch(() => {}));
    image = generated.image;
  } catch (err) {
    return { ok: false, errors: [`image generation failed: ${(err as Error).message}`] };
  }
  if (!image) {
    return {
      ok: false,
      errors: [
        `the model "${genModel}" returned no image. Check the image-generation model in ` +
          `Settings → Media (it must support image output).`,
      ],
    };
  }

  // Background removal (transparent cut-out). Only meaningful for PNG (the alpha
  // channel + our pure-JS codec); the gen model returns PNG. Degrades to the
  // original bytes on any failure — a cut-out miss shouldn't fail the whole call.
  if (valid.transparentBackground && image.contentType === "image/png") {
    image = { bytes: removeBackgroundFromPng(image.bytes), contentType: "image/png" };
  }

  // Same describe step as upload (vision model on the generated bytes, for search).
  // A failure returns "" and never blocks the asset, mirroring the upload path.
  const dataUrl = `data:${image.contentType};base64,${bufferToBase64(image.bytes)}`;
  let description = "";
  try {
    const describeModel = effectiveModel(
      aiConfig,
      "imageDescribe",
      await getImageModel(),
      DEFAULT_IMAGE_MODEL,
    );
    const described = await describeImage(dataUrl, describeModel, key);
    waitUntilOrInline(meterAiCall("imageDescribe", describeModel, described.cost).catch(() => {}));
    description = described.description;
  } catch {
    description = "";
  }

  try {
    // Filename = 2–5 meaningful words from the AI description (prompt when
    // describe failed) so the gallery shows what the image IS, not "generated".
    const filename = filenameFromText(
      description || valid.prompt,
      image.contentType.split("/")[1] ?? "png",
    );
    const assetKey = buildAssetKey(filename, image.contentType, crypto.randomUUID().slice(0, 8));
    // Stamp intrinsic dims from the file header so the AI image gets the CLS box +
    // srcset like uploads do — there's no browser here to run readImageDimensions,
    // so parse the bytes (imageDimensionsFromBytes; null → stored null, as before).
    const dims = imageDimensionsFromBytes(image.bytes);
    const row = await putAsset({
      key: assetKey,
      filename,
      contentType: image.contentType,
      bytes: image.bytes,
      description,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    });
    // Apply the model's tags (best-effort; the asset already exists either way).
    if (valid.tags.length > 0) {
      try {
        await setAssetTags(row.key, valid.tags);
      } catch {
        /* tag write is best-effort */
      }
    }
    return {
      ok: true,
      action: "generated",
      url: assetUrl(row.key),
      key: row.key,
      description,
      tags: valid.tags,
      model: genModel,
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save generated image: ${(err as Error).message}`] };
  }
}

/**
 * Upload base64 file bytes into the media library (the MCP-facing counterpart
 * of the gallery's multipart upload). Runs the SAME pipeline: validate type +
 * size (in the pure validator), R2 bytes + D1 row, intrinsic dims parsed from
 * the bytes (CLS box / srcset), a best-effort AI describe for search (key +
 * quota gated, exactly like the upload route — an upload is not an AI request,
 * so it never fails over a missing key or a spent budget), and optional tags.
 */
export async function handleUploadAsset(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUploadAsset(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };

  // Best-effort describe, images only. Any failure → "" (searchless asset).
  let description = "";
  if (valid.contentType.toLowerCase().startsWith("image/")) {
    try {
      const key = await resolveOpenrouterKey();
      if (key && !(await aiQuotaSpent())) {
        const aiConfig = await getAiConfig();
        const model = effectiveModel(
          aiConfig,
          "imageDescribe",
          await getImageModel(),
          DEFAULT_IMAGE_MODEL,
        );
        const dataUrl = `data:${valid.contentType};base64,${bufferToBase64(valid.bytes)}`;
        const described = await describeImage(dataUrl, model, key);
        waitUntilOrInline(meterAiCall("imageDescribe", model, described.cost).catch(() => {}));
        description = described.description;
      }
    } catch {
      description = "";
    }
  }

  try {
    const assetKey = buildAssetKey(valid.filename, valid.contentType, crypto.randomUUID().slice(0, 8));
    const dims = imageDimensionsFromBytes(valid.bytes);
    const row = await putAsset({
      key: assetKey,
      filename: valid.filename,
      contentType: valid.contentType,
      bytes: valid.bytes,
      description,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    });
    if (valid.tags.length > 0) {
      try {
        await setAssetTags(row.key, valid.tags);
      } catch {
        /* tag write is best-effort */
      }
    }
    return {
      ok: true,
      action: "uploaded",
      // Dims-stamped like list_assets, so the URL carries the CLS box when
      // dropped into a page (withAssetDims is a no-op for dimless assets).
      url: withAssetDims(assetUrl(row.key), dims?.width, dims?.height),
      key: row.key,
      filename: valid.filename,
      contentType: valid.contentType,
      size: valid.bytes.byteLength,
      description,
      tags: valid.tags,
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save asset: ${(err as Error).message}`] };
  }
}
