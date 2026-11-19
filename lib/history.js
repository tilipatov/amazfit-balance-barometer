import { readFileSync, writeFileSync } from '@zos/fs'
import { addSample, validPressure } from './pressure.js'

export const FOREGROUND = 'pressure-open.json'
export const BACKGROUND = 'pressure-background.json'
const utf8 = { encoding: 'utf8' }

export function readHistory(path) {
  try {
    const file = readFileSync({ path, options: utf8 })
    if (!file) return []
    const history = JSON.parse(file)
    if (!Array.isArray(history)) return []
    return history.filter(sample => Array.isArray(sample)
      && Number.isFinite(sample[0]) && validPressure(sample[1]))
  } catch (error) {
    console.log('Pressure history:', String(error))
    return []
  }
}

export function recordSample(path, history, now, pressure) {
  const updated = addSample(history, now, pressure)
  if (updated !== history) {
    try {
      const data = JSON.stringify(updated)
      writeFileSync({ path, data, options: utf8 })
      // A background write can be ignored by Zepp OS while the screen is active.
      if (readFileSync({ path, options: utf8 }) !== data) return history
    } catch (error) {
      console.log('Pressure sample:', String(error))
      return history
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
