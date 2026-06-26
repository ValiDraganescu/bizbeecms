/**
 * ai-attachments — pure tests for the attachment helpers. `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mimeToModality,
  acceptsFile,
  toDataUri,
  toInlineContentPart,
} from "./attachments.ts";

const VISION = ["text", "image"];
const TEXT_ONLY = ["text"];
const FILE_MODEL = ["text", "file"];

test("mimeToModality maps families", () => {
  assert.equal(mimeToModality("image/png"), "image");
  assert.equal(mimeToModality("image/jpeg; charset=binary"), "image");
  assert.equal(mimeToModality("audio/mpeg"), "audio");
  assert.equal(mimeToModality("video/mp4"), "video");
  assert.equal(mimeToModality("application/pdf"), "file");
  assert.equal(mimeToModality("text/plain"), "file");
});

test("vision model accepts images, rejects pdf", () => {
  assert.equal(acceptsFile(VISION, "image/png"), true);
  assert.equal(acceptsFile(VISION, "application/pdf"), false);
});

test("text-only model rejects everything attachable", () => {
  assert.equal(acceptsFile(TEXT_ONLY, "image/png"), false);
  assert.equal(acceptsFile(TEXT_ONLY, "application/pdf"), false);
});

test("file model accepts pdf, rejects image", () => {
  assert.equal(acceptsFile(FILE_MODEL, "application/pdf"), true);
  assert.equal(acceptsFile(FILE_MODEL, "image/png"), false);
});

test("empty modalities → treated as text-only", () => {
  assert.equal(acceptsFile([], "image/png"), false);
});

test("toDataUri assembles correctly", () => {
  assert.equal(toDataUri("image/png", "QUJD"), "data:image/png;base64,QUJD");
});

test("image → image_url content part with data-URI", () => {
  const part = toInlineContentPart("image/png", "QUJD", "shot.png");
  assert.deepEqual(part, {
    type: "image_url",
    image_url: { url: "data:image/png;base64,QUJD" },
  });
});

test("pdf → file content part with filename + data-URI", () => {
  const part = toInlineContentPart("application/pdf", "JVBE", "spec.pdf");
  assert.deepEqual(part, {
    type: "file",
    file: { filename: "spec.pdf", file_data: "data:application/pdf;base64,JVBE" },
  });
});
