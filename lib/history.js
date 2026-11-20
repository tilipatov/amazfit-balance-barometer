import { readFileSync, statSync, writeFileSync } from '@zos/fs'
import { addSample, validPressure } from './pressure.js'

export const FOREGROUND = 'pressure-open.json'
export const BACKGROUND = 'pressure-background.json'
const utf8 = { encoding: 'utf8' }

export function readHistory(path) {
  try {
    const file = readFileSync({ path, options: utf8 })
    if (file === undefined) {
      if (statSync({ path }) === undefined) return []
      console.log('Pressure history: existing file could not be read', path)
      return null
    }
    const history = JSON.parse(file)
    if (!Array.isArray(history)) {
      console.log('Pressure history: invalid format', path)
      return null
    }
    return history.filter(sample => Array.isArray(sample)
      && Number.isFinite(sample[0]) && validPressure(sample[1]))
  } catch (error) {
    console.log('Pressure history:', String(error))
    return null
  }
}

export function recordSample(path, now, pressure, cached) {
  if (!validPressure(pressure)) return cached
  if (cached && addSample(cached, now, pressure) === cached) return cached
  const history = readHistory(path)
  // A failed read must never become the starting point for a write.
  if (history === null) return cached
  const updated = addSample(history, now, pressure)
  if (updated !== history) {
    try {
      const data = JSON.stringify(updated)
      writeFileSync({ path, data, options: utf8 })
      // A background write can be ignored by Zepp OS while the screen is active.
      if (readFileSync({ path, options: utf8 }) !== data) return cached
    } catch (error) {
      console.log('Pressure sample:', String(error))
      return cached
    }
  }
  return updated
}

export function readPressure(barometer) {
  try {
    const pressure = barometer && barometer.getAirPressure()
    return validPressure(pressure) ? pressure : null
  } catch (error) {
    console.log('Barometer:', String(error))
    return null
  }
}
