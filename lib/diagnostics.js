import { readFileSync, statSync, writeFileSync } from '@zos/fs'
import { log } from '@zos/utils'
import { keepDiagnosticEvents } from './diagnostic-data.js'

const logger = log.getLogger('BarometerDiag')
const BACKGROUND_LOG = 'diagnostics-background.json'
const PAGE_LOG = 'diagnostics-page.json'
const utf8 = { encoding: 'utf8' }

function readEvents(path) {
  try {
    const data = readFileSync({ path, options: utf8 })
    if (data === undefined && statSync({ path }) === undefined) return []
    const events = JSON.parse(data)
    if (Array.isArray(events)) return events
  } catch {}
  logger.warn('Diagnostic log could not be read: ' + path)
  return null
}

export function logBackgroundStart(time) {
  logger.info(time + ' background start')
}

export function recordDiagnostic(event) {
  logger.info(JSON.stringify(event))
  const background = event.kind === 'background'
  const path = background ? BACKGROUND_LOG : PAGE_LOG
  try {
    const events = readEvents(path)
    if (events === null) return
    const data = JSON.stringify(keepDiagnosticEvents([...events, event], Date.now(), background ? 160 : 80))
    writeFileSync({ path, data, options: utf8 })
    if (readFileSync({ path, options: utf8 }) !== data) {
      logger.warn('Diagnostic log write could not be verified: ' + path)
    }
  } catch (error) {
    logger.warn('Diagnostic log write failed: ' + String(error))
  }
}

export function readDiagnostics(now) {
  const background = readEvents(BACKGROUND_LOG)
  const page = readEvents(PAGE_LOG)
  return {
    unavailable: [background === null ? 'background' : null, page === null ? 'graph' : null].filter(Boolean),
    events: keepDiagnosticEvents([...(background ?? []), ...(page ?? [])], now),
  }
}
