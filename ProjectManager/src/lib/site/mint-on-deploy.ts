/**
 * KEY-MINTING Slice 5: decide whether the deploy route should mint a new
 * OpenRouter key for a Site before dispatching the deploy.
 *
 * Pure so the mint?/skip? rule is testable without OpenRouter or a DB. The route
 * does the actual mint + encrypt + persist when this returns true.
 *
 * Rule (idempotent): mint ONLY when minting is enabled AND no key exists yet
 * (`keyHash` is null/empty). A Site that already has a minted key is never
 * re-minted — a second deploy reuses the existing key.
 */
export function shouldMintOnDeploy(
  mintingEnabled: boolean,
  keyHash: string | null | undefined,
): boolean {
  return mintingEnabled === true && (keyHash == null || keyHash === "");
}
