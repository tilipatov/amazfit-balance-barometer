import { LocalStorage } from '@zos/storage'
import { getLanguage } from '@zos/settings'
import { cancel, getAllAlarms, REPEAT_MINUTE, set } from '@zos/alarm'
import { PERIODS, SAMPLE_MINUTES, UNITS } from './pressure.js'

export const COLORS = ['auto', 'blue', 'mint', 'gold', 'rose', 'violet']
const prefs = new LocalStorage()

export function readSettings() {
  const saved = prefs.getItem('preferences', {}) || {}
  return {
    language: ['en', 'ru'].includes(saved.language)
      ? saved.language : (getLanguage() === 4 ? 'ru' : 'en'),
    unit: Object.keys(UNITS).includes(saved.unit) ? saved.unit : 'mmHg',
    theme: saved.theme === 'light' ? 'light' : 'dark',
    color: COLORS.includes(saved.color) ? saved.color : 'auto',
    showTenths: saved.showTenths !== false,
    trends: [60, 180].map((period, index) => {
      const trend = (saved.trends || [])[index] || {}
      return {
        enabled: trend.enabled === true,
        minutes: PERIODS.includes(trend.minutes) ? trend.minutes : period,
        mode: trend.mode === 'sign' ? 'sign' : 'arrow',
      }
    }),
  }
}

export function saveSettings(settings) {
  prefs.setItem('preferences', settings)
}

export function syncSamplingAlarm(enabled) {
  try {
    const alarms = getAllAlarms()
    if (!enabled) {
      alarms.forEach(id => cancel(id))
      return true
    }
    if (alarms.length) return true
    return set({
      url: 'app-service/sample',
      delay: SAMPLE_MINUTES * 60,
      repeat_type: REPEAT_MINUTE,
      repeat_period: SAMPLE_MINUTES,
      repeat_duration: 1,
      store: true,
    }) > 0
  } catch (error) {
    console.log('Pressure alarm:', String(error))
    return false
  }
}
