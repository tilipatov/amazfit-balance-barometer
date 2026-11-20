import { readFileSync, statSync, writeFileSync } from '@zos/fs'
import { addSample, validPressure } from './pressure.js'

export const FOREGROUND = 'pressure-open.json'
export const BACKGROUND = 'pressure-background.json'
const utf8 = { encoding: 'utf8' }

export function readHistory(path, report) {
  try {
    const file = readFileSync({ path, options: utf8 })
    if (file === undefined) {
      if (statSync({ path }) === undefined) {
        if (report) report({ status: 'missing' })
        return []
      }
      if (report) report({ status: 'unreadable' })
      console.log('Pressure history: existing file could not be read', path)
      return null
    }
    const history = JSON.parse(file)
    if (!Array.isArray(history)) {
      if (report) report({ status: 'invalid' })
      console.log('Pressure history: invalid format', path)
      return null
    }
    const samples = history.filter(sample => Array.isArray(sample)
      && Number.isFinite(sample[0]) && validPressure(sample[1]))
    if (report) report({
      status: 'loaded', count: samples.length, rejected: history.length - samples.length,
      first: samples[0]?.[0], last: samples[samples.length - 1]?.[0],
    })
    return samples
  } catch (error) {
    if (report) report({ status: error instanceof SyntaxError ? 'invalid' : 'read-error' })
    console.log('Pressure history:', String(error))
    return null
  }
}

export function recordSample(path, now, pressure, cached, trace) {
  if (!validPressure(pressure)) return cached
  if (cached && addSample(cached, now, pressure) === cached) return cached
  const history = readHistory(path, trace && (details => { trace.history = details }))
  // A failed read must never become the starting point for a write.
  if (history === null) {
    if (trace) trace.result = 'history-error'
    return cached
  }
  const updated = addSample(history, now, pressure)
  if (updated !== history) {
    let written = false
    try {
      const data = JSON.stringify(updated)
      writeFileSync({ path, data, options: utf8 })
      written = true
      // A background write can be ignored by Zepp OS while the screen is active.
      if (readFileSync({ path, options: utf8 }) !== data) {
        if (trace) trace.result = 'unverified'
        return cached
      }
    } catch (error) {
      if (trace) trace.result = written ? 'unverified' : 'write-error'
      console.log('Pressure sample:', String(error))
      return cached
    }
  }
  if (trace) trace.result = updated === history ? 'duplicate' : 'saved'
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
