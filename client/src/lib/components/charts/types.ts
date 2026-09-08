/** Shapes the chart components read. Deliberately free of any data source. */

export interface Point {
  x: number
  y: number
}

export interface Series {
  name: string
  colour: string
  points: Point[]
}

export interface Row {
  label: string
  value: number
  /** Secondary line, shown on hover or in the table twin. */
  sub?: string
  /**
   * Which side of a diverging axis this sits on. Kept separate from `value`
   * because the sign of the value cannot carry it: the middle band is neither
   * side, and encoding that as zero would erase its magnitude.
   */
  side?: 'under' | 'level' | 'over'
}
