import { BACKGROUND_SAMPLE_MINUTES, MINUTE, UNITS } from './pressure.js'

export const CHART_PERIODS = [180, 360, 720, 1440]
const MAX_GAP = (BACKGROUND_SAMPLE_MINUTES + 3) * MINUTE

export function makeChart(history, now, minutes, unit) {
  const start = now - minutes * MINUTE
  const scale = UNITS[unit].factor
  const samples = history.filter(([time]) => time >= start && time <= now)
    .sort((left, right) => left[0] - right[0])
  if (!samples.length) return { start, points: [] }

  const values = samples.map(([, pressure]) => pressure * scale)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max(scale, (max - min) * 0.1)
  const bottom = min - padding
  const top = max + padding
  const points = samples.map(([time, pressure], index) => ({
    time,
    pressure,
    x: (time - start) / (now - start),
    y: (top - values[index]) / (top - bottom),
    connect: index > 0 && time - samples[index - 1][0] <= MAX_GAP,
  }))
  return { start, top, bottom, points }
}
