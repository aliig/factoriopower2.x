// Quality strengths are 0/1/2/3/5 and stats gain +30% per strength level
// (https://wiki.factorio.com/Quality), i.e. x1.0/1.3/1.6/1.9/2.5. Multipliers
// are expressed in tenths so scaling stays exact integer arithmetic; every
// base stat that uses scaleByQuality is a multiple of 10, so no scaled value
// is ever fractional.

export type QualityTier = "normal" | "uncommon" | "rare" | "epic" | "legendary";
export type QualityMap = Record<QualityTier, number>;

export const QUALITY_MULTIPLIER_TENTHS: QualityMap = {
  normal: 10, uncommon: 13, rare: 16, epic: 19, legendary: 25,
};

// Quality strength levels (quality/prototypes/quality.lua `level` fields).
export const QUALITY_LEVELS: QualityMap = {
  normal: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5,
};

export const QUALITY_TIERS = Object.keys(QUALITY_MULTIPLIER_TENTHS) as QualityTier[];

export function mapQuality(fn: (tier: QualityTier) => number): QualityMap {
  const scaled = {} as QualityMap;
  for (const tier of QUALITY_TIERS) scaled[tier] = fn(tier);
  return scaled;
}

export function scaleByQuality(baseStat: number): QualityMap {
  return mapQuality((q) => (baseStat * QUALITY_MULTIPLIER_TENTHS[q]) / 10);
}

// For base stats that are not multiples of 10 (e.g. 4/s coolant becomes
// 5.2/s at uncommon): values are kept in *tenths* of a unit so all the
// arithmetic stays on exact integers.
export function scaleByQualityTenths(baseStat: number): QualityMap {
  return mapQuality((q) => baseStat * QUALITY_MULTIPLIER_TENTHS[q]);
}

// Some stats (accumulator capacity) are special-cased by the engine to
// +100% per quality *level* instead of the standard +30% per level.
export function scaleByQualityLevel(baseStat: number): QualityMap {
  return mapQuality((q) => baseStat * (1 + QUALITY_LEVELS[q]));
}
