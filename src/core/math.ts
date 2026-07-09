// Exact integer arithmetic helpers. Fractions are reduced [numerator,
// denominator] integer pairs; every intermediate integer stays far below
// 2^53, so plain number arithmetic is exact.

export type Fraction = readonly [number, number];

export function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function fReduce([n, d]: Fraction): Fraction {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}
