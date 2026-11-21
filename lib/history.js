import { readHistoryStore, writeHistoryStore } from './history-store.js'
import { addSample, validPressure } from './pressure.js'

export const FOREGROUND = 'pressure-open.json'
export const BACKGROUND = 'pressure-background.json'

function validSample(sample) {
  return Array.isArray(sample) && Number.isFinite(sample[0]) && validPressure(sample[1])
}

export function readHistory(path) {
  const store = readHistoryStore(path, validSample)
  return store.status === 'invalid' ? null : store.items
}

export function recordSample(path, now, pressure, cached) {
  if (!validPressure(pressure)) return cached
  if (cached && addSample(cached, now, pressure) === cached) return cached
  const store = readHistoryStore(path, validSample)
  if (store.items === null) return cached
  const history = store.status === 'invalid' && cached ? cached : store.items
  const updated = addSample(history, now, pressure)
  const result = updated === history ? 'duplicate' : writeHistoryStore(store, updated)
  if (result === 'saved' || result === 'duplicate') return updated
  return cached
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
