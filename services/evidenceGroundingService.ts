/**
 * services/evidenceGroundingService.ts
 *
 * Centralized evidence citation grounding service.
 * Verifies if a given cited snippet or finding matches a reference document source text.
 */

export function isEvidenceCitationPlausible(
  citedText: string,
  poolItemText: string,
  minTokenOverlap = 0.4
): boolean {
  const cited = citedText.toLowerCase().trim();
  const pool = poolItemText.toLowerCase().trim();

  // Gate 1: minimum length or acronym allowlist
  const shortTermAllowlist = [
    'hba1c', 'spo2', 'ecg', 'ct', 'mri', 'egfr', 'pvr', 'psa',
    'cbc', 'wbc', 'lft', 'rft', 'esr', 'crp', 'inr', 'hb',
    'bp', 'temp', 'u/s', 'usg', 'cxr', 'aki', 'dka', 'tlc'
  ];

  if (cited.length < 15 && !shortTermAllowlist.includes(cited)) {
    return false;
  }

  // Gate 2: exact substring matches
  if (pool.includes(cited) || cited.includes(pool)) {
    return true;
  }

  // Gate 3: token overlap of major words
  const citedTokens = new Set(cited.split(/\s+/).filter(t => t.length > 3));
  const poolTokens = new Set(pool.split(/\s+/).filter(t => t.length > 3));
  if (citedTokens.size === 0) return false;

  let overlap = 0;
  for (const token of citedTokens) {
    if (poolTokens.has(token)) overlap++;
  }

  const overlapRatio = overlap / citedTokens.size;
  return overlapRatio >= minTokenOverlap;
}
