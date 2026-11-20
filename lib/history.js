import { readHistoryStore, writeHistoryStore } from './history-store.js'
import { addSample, validPressure } from './pressure.js'

export const FOREGROUND = 'pressure-open.json'
export const BACKGROUND = 'pressure-background.json'

function validSample(sample) {
  return Array.isArray(sample) && Number.isFinite(sample[0]) && validPressure(sample[1])
}

function reportHistory(store) {
  const items = store.items ?? []
  return {
    status: store.status, count: items.length, rejected: store.rejected,
    first: items[0]?.[0], last: items[items.length - 1]?.[0],
    recovered: store.recovered, backup: store.backup, slots: store.slots,
  }
}

export function readHistory(path, report) {
  const store = readHistoryStore(path, validSample)
  if (report) report(reportHistory(store))
  return store.status === 'invalid' ? null : store.items
}

export function recordSample(path, now, pressure, cached, trace) {
  if (!validPressure(pressure)) return cached
  if (cached && addSample(cached, now, pressure) === cached) return cached
  const store = readHistoryStore(path, validSample)
  if (trace) trace.history = reportHistory(store)
  if (store.items === null) {
    if (trace) trace.result = 'history-error'
    return cached
  }
  const history = store.status === 'invalid' && cached ? cached : store.items
  const updated = addSample(history, now, pressure)
  const result = updated === history ? 'duplicate' : writeHistoryStore(store, updated)
  if (trace) trace.result = result
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
