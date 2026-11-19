import { LocalStorage } from '@zos/storage'
import { getLanguage } from '@zos/settings'
import { PERIODS, UNITS } from './pressure.js'
import { CHART_PERIODS } from './chart.js'

export const COLORS = ['auto', 'blue', 'mint', 'gold', 'orange', 'violet']
export const CHART_COLORS = [...COLORS, 'red', 'green']
const prefs = new LocalStorage()

export function readSettings() {
  const saved = prefs.getItem('preferences', {}) || {}
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
  prefs.setItem('preferences', settings)
}

export function readSamplingAlarm() {
  return prefs.getItem('pressureAlarm10m', null)
}

export function saveSamplingAlarm(id) {
  prefs.setItem('pressureAlarm10m', id)
}
