export const MINUTE = 60 * 1000
export const SAMPLE_MINUTES = 5
export const BACKGROUND_SAMPLE_MINUTES = 10
export const PERIODS = [15, 30, 60, 120, 180, 360, 720, 1440]
const HISTORY_LIMIT = (PERIODS[PERIODS.length - 1] + 15) * MINUTE

export const UNITS = {
  mmHg: { factor: 100 / 133.322387415, digits: 1, en: 'mmHg', ru: 'мм рт. ст.' },
  hPa: { factor: 1, digits: 1, en: 'hPa', ru: 'гПа' },
  kPa: { factor: 0.1, digits: 2, en: 'kPa', ru: 'кПа' },
  mbar: { factor: 1, digits: 1, en: 'mbar', ru: 'мбар' },
  inHg: { factor: 100 / 3386.389, digits: 2, en: 'inHg', ru: 'дюйм рт. ст.' },
  atm: { factor: 1 / 1013.25, digits: 4, en: 'atm', ru: 'атм' },
}

export function validPressure(value) {
  return Number.isFinite(value) && value > 0 && value <= 1300
}

export function formatPressure(pressure, key, showTenths) {
  if (!validPressure(pressure)) return '—'
  return (pressure * UNITS[key].factor).toFixed(showTenths ? 1 : 0)
}

export function formatTrend(delta, key, mode) {
  if (delta === null) return '—'
  const unit = UNITS[key]
  const rounded = Math.abs(delta * unit.factor).toFixed(unit.digits)
  const magnitude = rounded.replace(/\.?0+$/, '') || '0'
  if (Number(rounded) === 0) return mode === 'arrow' ? '→ 0' : '0'
  if (mode === 'arrow') return (delta > 0 ? '↑ ' : '↓ ') + magnitude
  return (delta > 0 ? '+' : '−') + magnitude
}

export function formatPeriod(minutes, language) {
  const russian = language === 'ru'
  if (minutes < 60) return minutes + (russian ? ' мин' : ' min')
  return minutes / 60 + (russian ? ' ч' : ' h')
}

export function trimHistory(history, now) {
  return history.filter(([time]) => time >= now - HISTORY_LIMIT && time <= now)
}

export function addSample(history, now, pressure) {
  if (!validPressure(pressure)) return history
  const last = history[history.length - 1]
  if (last && now >= last[0] && now - last[0] < (SAMPLE_MINUTES - 1) * MINUTE) {
    return history
  }
  return [...trimHistory(history, now), [now, pressure]]
}

export function pressureChange(history, now, pressure, minutes) {
  if (!validPressure(pressure)) return null
  const target = now - minutes * MINUTE
  let before
  let after
  for (const sample of history) {
    const [time] = sample
    if (time === target) return pressure - sample[1]
    if (time > now) continue
    if (time < target && (!before || time > before[0])) before = sample
    if (time > target && (!after || time < after[0])) after = sample
  }
  if (!before) return null
  if (after && after[0] - before[0] <= (BACKGROUND_SAMPLE_MINUTES + 2) * MINUTE) {
    const fraction = (target - before[0]) / (after[0] - before[0])
    const baseline = before[1] + (after[1] - before[1]) * fraction
    return pressure - baseline
  }
  const earlierGap = target - before[0]
  const laterGap = after ? after[0] - target : Infinity
  if (Math.min(earlierGap, laterGap) <= SAMPLE_MINUTES * MINUTE) {
    return pressure - (earlierGap <= laterGap ? before[1] : after[1])
  }
  return null
}
