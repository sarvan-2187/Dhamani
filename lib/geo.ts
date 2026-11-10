/** Home locations are rounded to 0.005 degrees (about 500 m) before storing (PRD 9.4 step 8). */
export function roundCoord(x: number): number {
  return Math.round(x * 200) / 200;
}
