import { Barometer } from '@zos/sensor'
import { BACKGROUND, readHistory, readPressure, recordSample } from '../lib/history.js'

AppService({
  onInit() {
    try {
      const pressure = readPressure(new Barometer())
      if (pressure !== null) {
        recordSample(BACKGROUND, readHistory(BACKGROUND), Date.now(), pressure)
      }
    } catch (error) {
      console.log('Background barometer:', String(error))
    }
  },
})
