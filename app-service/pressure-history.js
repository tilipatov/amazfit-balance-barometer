import { Barometer } from '@zos/sensor'
import { BACKGROUND, readPressure, recordSample } from '../lib/history.js'

AppService({
  onInit() {
    try {
      const pressure = readPressure(new Barometer())
      if (pressure === null) {
        console.log('Pressure timer: sensor reading unavailable')
        return
      }
      if (!recordSample(BACKGROUND, Date.now(), pressure)) {
        console.log('Pressure timer: no sample saved')
      }
    } catch (error) {
      console.log('Pressure timer sample:', String(error))
    }
  },
})
