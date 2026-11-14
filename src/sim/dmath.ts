/**
 * Deterministic math for game logic.
 *
 * Online duels run the same simulation on both phones (and on the server) from the same inputs, so every
 * result must match bit for bit. +, -, *, / and Math.sqrt are exactly rounded IEEE-754 operations in every
 * JavaScript engine, but Math.sin/cos/pow/log/exp/hypot are "implementation-approximated" and can differ in
 * the last bit between V8, JavaScriptCore and SpiderMonkey. Everything here is built from the exact
 * operations only. Rendering code can keep using Math.
 */

const LN2 = 0.6931471805599453;
const PI = 3.141592653589793;
const TAU = 6.283185307179586;

export const hypot = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const hypot3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

/** x^n for whole n by repeated squaring (exact operations only). */
function powInt(x: number, n: number): number {
  let neg = n < 0, r = 1, b = x;
  if (neg) n = -n;
  while (n > 0) {
    if (n & 1) r *= b;
    b *= b;
    n = Math.floor(n / 2);
  }
  return neg ? 1 / r : r;
}

/** Natural log for x > 0: split off powers of two, then a fast-converging atanh series. */
export function ln(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0;
  while (x >= 2) { x /= 2; e++; }
  while (x < 1) { x *= 2; e--; }
  // x in [1, 2): centre on sqrt(2) for faster convergence
  if (x > 1.4142135623730951) { x /= 2; e++; }
  const s = (x - 1) / (x + 1), s2 = s * s;
  let term = s, sum = 0;
  for (let k = 1; k < 40; k += 2) {
    const add = term / k;
    sum += add;
    if (Math.abs(add) < 1e-18) break;
    term *= s2;
  }
  return 2 * sum + e * LN2;
}

export const log2 = (x: number) => ln(x) / LN2;

/** e^x: split off whole multiples of ln 2, then a Taylor series on the small remainder. */
export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1, sum = 1;
  for (let i = 1; i < 30; i++) {
    term *= r / i;
    sum += term;
    if (Math.abs(term) < 1e-18) break;
  }
  return sum * powInt(2, k);
}

/** x^y. Whole exponents use exact repeated squaring; others go through exp/ln. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 1e6) return powInt(x, y);
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  return exp(y * ln(x));
}

/** sin for any x: reduce to [-π, π], then a Taylor series. */
export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  x = x - TAU * Math.round(x / TAU);
  // fold to [-π/2, π/2] for accuracy
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const x2 = x * x;
  let term = x, sum = x;
  for (let i = 1; i < 14; i++) {
    term *= -x2 / ((2 * i) * (2 * i + 1));
    sum += term;
  }
  return sum;
}

export const cos = (x: number) => sin(x + PI / 2);
