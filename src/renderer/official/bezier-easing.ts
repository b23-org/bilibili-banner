const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 10;
const SPLINE_TABLE_SIZE = 11;
const SAMPLE_STEP_SIZE = 1 / (SPLINE_TABLE_SIZE - 1);

function evalCubicBezier(t: number, a: number, b: number, c: number): number {
  return ((a * t + b) * t + c) * t;
}

function evalCubicBezierSlope(
  t: number,
  a: number,
  b: number,
  c: number,
): number {
  return 3 * a * t * t + 2 * b * t + c;
}

function binarySubdivideForT(
  x: number,
  intervalStart: number,
  intervalEnd: number,
  a: number,
  b: number,
  c: number,
): number {
  let currentT = intervalStart + (intervalEnd - intervalStart) / 2;
  let currentX = evalCubicBezier(currentT, a, b, c) - x;
  let iteration = 0;
  while (
    Math.abs(currentX) > SUBDIVISION_PRECISION &&
    ++iteration < SUBDIVISION_MAX_ITERATIONS
  ) {
    currentT = intervalStart + (intervalEnd - intervalStart) / 2;
    currentX = evalCubicBezier(currentT, a, b, c) - x;
    if (currentX > 0) intervalEnd = currentT;
    else intervalStart = currentT;
  }
  return currentT;
}

function newtonRaphsonRefineT(
  x: number,
  guessT: number,
  a: number,
  b: number,
  c: number,
): number {
  let refinedT = guessT;
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    const slope = evalCubicBezierSlope(refinedT, a, b, c);
    if (slope === 0) return refinedT;
    refinedT -= (evalCubicBezier(refinedT, a, b, c) - x) / slope;
  }
  return refinedT;
}

function bezierEasing(
  controlPointX1: number,
  controlPointY1: number,
  controlPointX2: number,
  controlPointY2: number,
): (input: number) => number {
  if (
    !(
      controlPointX1 >= 0 &&
      controlPointX1 <= 1 &&
      controlPointX2 >= 0 &&
      controlPointX2 <= 1
    )
  ) {
    throw new Error("bezier x values must be in [0, 1] range");
  }
  if (controlPointX1 === controlPointY1 && controlPointX2 === controlPointY2) {
    return (x: number) => x;
  }

  const cxX = 3 * controlPointX1;
  const bxX = 3 * (controlPointX2 - controlPointX1) - cxX;
  const axX = 1 - cxX - bxX;

  const cxY = 3 * controlPointY1;
  const bxY = 3 * (controlPointY2 - controlPointY1) - cxY;
  const axY = 1 - cxY - bxY;

  const sampleValues = new Float32Array(SPLINE_TABLE_SIZE);
  for (let i = 0; i < SPLINE_TABLE_SIZE; ++i) {
    sampleValues[i] = evalCubicBezier(i * SAMPLE_STEP_SIZE, axX, bxX, cxX);
  }

  function getTForX(x: number): number {
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = SPLINE_TABLE_SIZE - 1;
    for (
      ;
      currentSample !== lastSample && sampleValues[currentSample] <= x;
      ++currentSample
    ) {
      intervalStart += SAMPLE_STEP_SIZE;
    }
    --currentSample;

    const dist =
      (x - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessT = intervalStart + dist * SAMPLE_STEP_SIZE;
    const slope = evalCubicBezierSlope(guessT, axX, bxX, cxX);

    if (slope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonRefineT(x, guessT, axX, bxX, cxX);
    }
    if (slope === 0) {
      return guessT;
    }
    return binarySubdivideForT(
      x,
      intervalStart,
      intervalStart + SAMPLE_STEP_SIZE,
      axX,
      bxX,
      cxX,
    );
  }

  return (x: number) => {
    if (x === 0 || x === 1) return x;
    return evalCubicBezier(getTForX(x), axY, bxY, cxY);
  };
}

export function makeSymmetricCurve(
  curve: [number, number, number, number],
): EasingFunction {
  const bezierCurve = bezierEasing(...curve);
  return (x: number) => (x > 0 ? bezierCurve(x) : -bezierCurve(-x));
}

export type EasingFunction = (x: number) => number;
export const IDENTITY_EASING: EasingFunction = (x) => x;
