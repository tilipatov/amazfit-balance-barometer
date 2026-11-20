import { LocalStorage } from '@zos/storage'
import { getLanguage } from '@zos/settings'
import { BACKGROUND_SAMPLE_MINUTES, PERIODS, UNITS } from './pressure.js'
import { CHART_PERIODS } from './chart.js'

export const COLORS = ['auto', 'blue', 'mint', 'gold', 'orange', 'violet']
export const CHART_COLORS = [...COLORS, 'red', 'green']
let prefs

function preferences() {
  if (!prefs) prefs = new LocalStorage()
  return prefs
}

export function readSettings() {
  const saved = preferences().getItem('preferences', {}) || {}
  const color = saved.color === 'rose' ? 'orange' : saved.color
  return {
    language: ['en', 'ru'].includes(saved.language)
      ? saved.language : (getLanguage() === 4 ? 'ru' : 'en'),
    unit: Object.keys(UNITS).includes(saved.unit) ? saved.unit : 'mmHg',
    theme: saved.theme === 'light' ? 'light' : 'dark',
    color: COLORS.includes(color) ? color : 'auto',
    showTenths: saved.showTenths !== false,
    chartMinutes: CHART_PERIODS.includes(saved.chartMinutes) ? saved.chartMinutes : CHART_PERIODS[0],
    chartColor: CHART_COLORS.includes(saved.chartColor) ? saved.chartColor : 'mint',
    diagnosticMinutes: saved.diagnosticMinutes === 5 ? 5 : BACKGROUND_SAMPLE_MINUTES,
    swipeHintSeen: saved.swipeHintSeen === true,
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
  preferences().setItem('preferences', settings)
}

export function readSamplingAlarm() {
  const alarm = preferences().getItem('pressureAlarm10m', null)
  if (Number.isInteger(alarm)) return { id: alarm, minutes: BACKGROUND_SAMPLE_MINUTES }
  if (alarm && Number.isInteger(alarm.id) && [5, BACKGROUND_SAMPLE_MINUTES].includes(alarm.minutes)) return alarm
  return null
}

export function saveSamplingAlarm(id, minutes) {
  preferences().setItem('pressureAlarm10m', { id, minutes })
}
