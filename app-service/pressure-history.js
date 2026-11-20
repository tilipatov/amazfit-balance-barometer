import { Barometer } from '@zos/sensor'
import { BACKGROUND, readPressure, recordSample } from '../lib/history.js'
import { logBackgroundStart, recordDiagnostic } from '../lib/diagnostics.js'

AppService({
  onInit() {
    const trace = { time: Date.now(), kind: 'background' }
    logBackgroundStart(trace.time)
    try {
      const pressure = readPressure(new Barometer())
      if (pressure === null) {
        trace.result = 'sensor-error'
        console.log('Pressure timer: sensor reading unavailable')
      } else {
        trace.pressure = pressure
        if (!recordSample(BACKGROUND, Date.now(), pressure, undefined, trace)) {
          console.log('Pressure timer: no sample saved')
        }
      }
    } catch (error) {
      trace.result = 'unexpected-error'
      console.log('Pressure timer sample:', String(error))
    }
    recordDiagnostic(trace)
  },
})
