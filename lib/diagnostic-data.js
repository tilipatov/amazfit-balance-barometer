export const BETA_VERSION = '1.1.5 Beta 2'
export const DIAGNOSTIC_METHOD = 'barometer.diagnostics'
export const DIAGNOSTIC_STORAGE = 'barometer-diagnostics-beta1'
export const CHUNK_SIZE = 12
export const MAX_EVENTS = 240
const DAY = 24 * 60 * 60 * 1000

export function keepDiagnosticEvents(events, now, limit = MAX_EVENTS) {
  const unique = new Map()
  for (const event of events) {
    if (event.time >= now - DAY && event.time <= now) {
      unique.set(event.time + ':' + event.kind, event)
    }
  }
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-limit)
}

export function readDiagnosticSnapshot(value) {
  try {
    const snapshot = JSON.parse(value)
    if (Number.isSafeInteger(snapshot.syncedAt) && Array.isArray(snapshot.events)) return snapshot
  } catch {}
  return null
}
