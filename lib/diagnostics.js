import { log } from '@zos/utils'
import { keepDiagnosticEvents } from './diagnostic-data.js'
import { readHistoryStore, writeHistoryStore } from './history-store.js'

const logger = log.getLogger('BarometerDiag')
const BACKGROUND_LOG = 'diagnostics-background.json'
const PAGE_LOG = 'diagnostics-page.json'

function validEvent(event) {
  return event && Number.isSafeInteger(event.time) && ['background', 'graph'].includes(event.kind)
}

function logHealth(store) {
  return { status: store.status, recovered: store.recovered, backup: store.backup, slots: store.slots }
}

export function logBackgroundStart(time) {
  logger.info(time + ' background start')
}

export function recordDiagnostic(event) {
  const background = event.kind === 'background'
  const path = background ? BACKGROUND_LOG : PAGE_LOG
  const store = readHistoryStore(path, validEvent)
  if (store.backup || store.status === 'invalid' || store.status === 'recovered') {
    event = { ...event, logHealth: logHealth(store) }
  }
  logger.info(JSON.stringify(event))

  const events = keepDiagnosticEvents([...(store.items ?? []), event], Date.now(), background ? 160 : 80)
  const result = writeHistoryStore(store, events)
  if (result !== 'saved') logger.warn('Diagnostic log ' + result + ': ' + path)
}

export function readDiagnostics(now) {
  const background = readHistoryStore(BACKGROUND_LOG, validEvent)
  const page = readHistoryStore(PAGE_LOG, validEvent)
  return {
    unavailable: [background.items === null ? 'background' : null, page.items === null ? 'graph' : null].filter(Boolean),
    stores: { background: logHealth(background), graph: logHealth(page) },
    events: keepDiagnosticEvents([...(background.items ?? []), ...(page.items ?? [])], now),
  }
}
