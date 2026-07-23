/**
 * ai-cost-quotas — PM-curated AI model config (docs/ai-cost-quotas.md,
 * shapes pinned in docs/ai-cost-quotas-contracts.md Contract A/B).
 *
 * The PM curates, per purpose, an ordered list of model aliases; sites store
 * alias `key`s (the product) while the underlying OpenRouter `model` id stays
 * an operator-swappable implementation detail. First entry of a purpose list
 * is that purpose's default.
 */

export type AiPurpose =
  | "chatAgent"
  | "assistant"
  | "imageDescribe"
  | "imageGenerate"
  | "translate";

export const AI_PURPOSES: readonly AiPurpose[] = [
  "chatAgent",
  "assistant",
  "imageDescribe",
  "imageGenerate",
  "translate",
];

export interface CuratedModel {
  /** Stable slug ([a-z0-9-]); what sites persist. Never renamed. */
  key: string;
  /** Customer-facing alias name; freely renamable. */
  label: string;
  /** OpenRouter model id; swappable without touching site data. */
  model: string;
  /** Per-alias margin percent (billable = cost × (1 + marginPct/100)). */
  marginPct: number;
}

export interface AiConfig {
  version: 1;
  purposes: Record<AiPurpose, { models: CuratedModel[] }>;
  /** Site's monthly quota in customer USD; null = no quota. */
  quota: { monthlyUsd: number | null };
}
