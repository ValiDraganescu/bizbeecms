/**
 * LLM-as-judge for the subjective parts (translation quality, chat answer
 * quality, generated-image adherence). One fixed judge model for every
 * candidate so the scale is comparable; the judge answers with a JSON
 * `{score:1-5, reason}` which we parse tolerantly. Deterministic checks always
 * run first — the judge only refines what rules can't decide.
 */
import { chat, messageText } from "./openrouter.mjs";

export const DEFAULT_JUDGE = "openai/gpt-5.4";

export async function judge(apiKey, judgeModel, { rubric, content, imageDataUrl }) {
  if (!judgeModel) return { score: null, reason: "judge disabled", costUsd: 0, disabled: true };
  const userParts = [{ type: "text", text: `${rubric}\n\n---\n${content}\n---\nReply with ONLY JSON: {"score": <1-5 integer>, "reason": "<one sentence>"}` }];
  if (imageDataUrl) userParts.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const res = await chat(apiKey, {
    model: judgeModel,
    messages: [
      { role: "system", content: "You are a strict, consistent evaluator. Score 5 = flawless, 4 = minor issues, 3 = acceptable with clear flaws, 2 = poor, 1 = unusable/wrong. Judge ONLY against the rubric." },
      { role: "user", content: userParts },
    ],
    maxTokens: 200,
    temperature: 0,
  });
  const text = messageText(res.message);
  const m = /\{[\s\S]*\}/.exec(text);
  let score = null;
  let reason = text.slice(0, 200);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (Number.isInteger(j.score) && j.score >= 1 && j.score <= 5) score = j.score;
      if (typeof j.reason === "string") reason = j.reason;
    } catch {
      /* keep nulls */
    }
  }
  return { score, reason, costUsd: res.usage.costUsd ?? 0 };
}
