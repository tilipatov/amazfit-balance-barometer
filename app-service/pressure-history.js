import { Barometer, Time } from '@zos/sensor'
import { BACKGROUND, readHistory, readPressure, recordSample } from '../lib/history.js'
import { MINUTE, SAMPLE_MINUTES } from '../lib/pressure.js'

AppService({
  onInit() {
    const clock = new Time()
    let barometer
    let history = readHistory(BACKGROUND)
    const sample = () => {
      const now = Date.now()
      const last = history[history.length - 1]
      if (last && now >= last[0] && now - last[0] < (SAMPLE_MINUTES - 1) * MINUTE) return
      try {
        if (!barometer) barometer = new Barometer()
        history = recordSample(BACKGROUND, history, now, readPressure(barometer))
      } catch (error) {
        console.log('Background barometer:', String(error))
      }
    }
    clock.onPerMinute(sample)
    sample()
  },
})
