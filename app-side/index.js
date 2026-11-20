import { BaseSideService } from '@zeppos/zml/base-side'
import {
  CHUNK_SIZE, DIAGNOSTIC_METHOD, DIAGNOSTIC_STORAGE, MAX_EVENTS,
  keepDiagnosticEvents, readDiagnosticSnapshot,
} from '../lib/diagnostic-data.js'

let pending

AppSideService(BaseSideService({
  onRequest(request, reply) {
    if (request.method !== DIAGNOSTIC_METHOD) return reply('Unknown method')
    const { time, language, index, total, events, unavailable, stores } = request.params || {}
    if (!Number.isSafeInteger(time) || !Number.isInteger(index)
      || !Number.isInteger(total) || total < 1 || total > Math.ceil(MAX_EVENTS / CHUNK_SIZE)
      || index < 0 || index >= total || !Array.isArray(events) || events.length > CHUNK_SIZE
      || !Array.isArray(unavailable) || unavailable.length > 2
      || !unavailable.every(kind => ['background', 'graph'].includes(kind))
      || !events.every(event => event && Number.isSafeInteger(event.time)
        && ['background', 'graph'].includes(event.kind))) {
      return reply('Invalid diagnostic packet')
    }

    if (index === 0) pending = { time, total, next: 0, events: [] }
    if (!pending || pending.time !== time || pending.total !== total || pending.next !== index) {
      return reply('Unexpected diagnostic packet')
    }

    pending.events.push(...events)
    pending.next++
    const complete = pending.next === total
    if (complete) {
      const received = pending.events
      pending = undefined
      try {
        const previous = readDiagnosticSnapshot(this.settings.getItem(DIAGNOSTIC_STORAGE))
        const snapshot = JSON.stringify({
          syncedAt: time,
          language: language === 'ru' ? 'ru' : 'en',
          unavailable,
          stores,
          events: keepDiagnosticEvents([...(previous?.events ?? []), ...received], time),
        })
        this.settings.setItem(DIAGNOSTIC_STORAGE, snapshot)
        if (this.settings.getItem(DIAGNOSTIC_STORAGE) !== snapshot) return reply('Diagnostic log was not saved')
      } catch {
        return reply('Could not save the diagnostic log')
      }
    }
    reply(null, { index, complete })
  },
}))
