import { queryPermission, requestPermission } from '@zos/app'
import { getAllAppServices, start, stop } from '@zos/app-service'
import { cancel, getAllAlarms } from '@zos/alarm'

const SERVICE = 'app-service/pressure-history'
// The Zepp OS 3.0 sample uses url, while the current reference specifies file.
const SERVICE_TARGET = { file: SERVICE, url: SERVICE }
const PERMISSIONS = ['device:os.bg_service']

export function cancelLegacySamplingAlarms() {
  try {
    // Releases up to 1.0.1 only created alarms for pressure sampling.
    getAllAlarms().forEach(id => cancel(id))
  } catch (error) {
    console.log('Legacy pressure alarms:', String(error))
  }
}

export function setBackgroundSampling(enabled, complete) {
  const isRunning = () => getAllAppServices().includes(SERVICE)
  const authorized = () => queryPermission({ permissions: PERMISSIONS })[0] === 2
  const startSampling = () => {
    if (isRunning()) {
      complete(true)
      return
    }
    const code = start({ ...SERVICE_TARGET, complete_func: ({ result }) => complete(result) })
    if (code) {
      console.log('Pressure service start:', code)
      complete(false)
    }
  }
  try {
    if (!enabled) {
      if (authorized() && isRunning()) {
        const code = stop({ ...SERVICE_TARGET, complete_func: () => complete(false) })
        if (!code) return
        console.log('Pressure service stop:', code)
      }
      complete(false)
    } else if (authorized()) {
      startSampling()
    } else {
      const code = requestPermission({
        permissions: PERMISSIONS,
        callback: ([status]) => {
          try {
            if (status === 2) startSampling()
            else complete(false)
          } catch (error) {
            console.log('Pressure service permission:', String(error))
            complete(false)
          }
        },
      })
      if (code) complete(false)
    }
  } catch (error) {
    console.log('Pressure service:', String(error))
    complete(false)
  }
}
