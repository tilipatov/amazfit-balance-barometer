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
      writeFileSync({ path, data: JSON.stringify(updated), options: utf8 })
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
