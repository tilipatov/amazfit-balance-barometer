import { Barometer } from '@zos/sensor'
import { BACKGROUND, readHistory, readPressure, recordSample } from '../lib/history.js'

AppService({
  onInit() {
    try {
      const pressure = readPressure(new Barometer())
      if (pressure === null) {
        console.log('Pressure timer: sensor reading unavailable')
        return
      }
      const history = readHistory(BACKGROUND)
      const updated = recordSample(BACKGROUND, history, Date.now(), pressure)
      if (updated === history) console.log('Pressure timer: no new sample saved')
    } catch (error) {
      console.log('Pressure timer sample:', String(error))
    }
  },
})
