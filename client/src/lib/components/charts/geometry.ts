/**
 * Path helpers shared by the chart marks.
 *
 * Bars are rounded at the data end and square at the baseline: the rounded cap
 * says "this is where the value stops", and a rounded baseline would lift the
 * bar off its own axis.
 */

export const CAP = 4

/** A rect rounded on one horizontal end only. */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  end: 'right' | 'left',
): string {
  const r = Math.max(0, Math.min(CAP, Math.abs(w) / 2, h / 2))
  if (r === 0 || w === 0) return `M${x},${y}h${w}v${h}h${-w}Z`
  return end === 'right'
    ? `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`
    : `M${x + w},${y}H${x + r}A${r},${r} 0 0 0 ${x},${y + r}V${y + h - r}A${r},${r} 0 0 0 ${x + r},${y + h}H${x + w}Z`
}

/** Polyline through points already in pixel space. */
export const linePath = (pts: ReadonlyArray<{x: number; y: number}>): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')

/** The same line closed down to the baseline, for the area wash. */
export const areaPath = (
  pts: ReadonlyArray<{x: number; y: number}>,
  baselineY: number,
): string =>
  pts.length === 0
    ? ''
    : `${linePath(pts)}L${pts[pts.length - 1]!.x.toFixed(1)},${baselineY}L${pts[0]!.x.toFixed(1)},${baselineY}Z`

/** Axis ticks at round numbers, always including zero and the top. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(6))
  return out
}
