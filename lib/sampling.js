import { queryPermission } from '@zos/app'
import { getAllAppServices, stop } from '@zos/app-service'
import { cancel, getAllAlarms, REPEAT_MINUTE, set } from '@zos/alarm'
import { BACKGROUND_SAMPLE_MINUTES } from './pressure.js'
import { readSamplingAlarm, saveSamplingAlarm } from './watch-data.js'

const SERVICE = 'app-service/pressure-history'
const LEGACY_PERMISSION = 'device:os.bg_service'

function stopLegacyService() {
  try {
    if (queryPermission({ permissions: [LEGACY_PERMISSION] })[0] !== 2) return
    if (!getAllAppServices().includes(SERVICE)) return
    const code = stop({
      file: SERVICE,
      url: SERVICE,
      complete_func: ({ result }) => {
        if (!result) console.log('Previous pressure service could not be stopped')
      },
    })
    if (code) console.log('Previous pressure service stop:', code)
  } catch (error) {
    console.log('Previous pressure service:', String(error))
  }
}

export function setBackgroundSampling(enabled, minutes = BACKGROUND_SAMPLE_MINUTES) {
  try {
    const current = readSamplingAlarm()
    const alarms = getAllAlarms()
    if (current === null) stopLegacyService()
    const keep = enabled && current?.minutes === minutes ? current.id : null

    // Earlier versions only registered alarms for pressure sampling.
    for (const id of alarms) {
      if (id !== keep) cancel(id)
    }
    if (!enabled) return false
    const remaining = getAllAlarms()
    if (remaining.some(id => id !== keep)) {
      console.log('Previous pressure timer could not be cancelled')
      return false
    }
    if (remaining.includes(keep)) return true

    const id = set({
      url: SERVICE,
      delay: minutes * 60,
      repeat_type: REPEAT_MINUTE,
      repeat_period: minutes,
      repeat_duration: 1,
      store: true,
    })
    if (!id) {
      console.log('Pressure timer could not be registered')
      return false
    }
    saveSamplingAlarm(id, minutes)
    return true
  } catch (error) {
    console.log('Pressure timer:', String(error))
    return false
  }
}
