import * as ui from '@zos/ui'
import { Barometer } from '@zos/sensor'
import { GESTURE_RIGHT, KEY_BACK, KEY_EVENT_CLICK, onGesture, onKey, offGesture, offKey } from '@zos/interaction'
import { formatPeriod, formatPressure, formatTrend, MINUTE, PERIODS, pressureChange, UNITS } from '../lib/pressure.js'
import { BACKGROUND, FOREGROUND, readHistory, readPressure, recordSample } from '../lib/history.js'
import { COLORS, readSettings, saveSettings, syncSamplingAlarm } from '../lib/watch-data.js'
import { STRINGS } from '../lib/strings.js'

const PALETTES = {
  dark: {
    background: 0x000000, surface: 0x223039, pressed: 0x344653, outline: 0x304148,
    text: 0xeaf3f8, muted: 0xa1b4c1,
    auto: 0xeaf3f8, blue: 0x89c9ff, mint: 0x78decf, gold: 0xffd686, rose: 0xff9eac, violet: 0xc5b4ff,
  },
  light: {
    background: 0xd6dddf, surface: 0xbdc9ce, pressed: 0xaebec4, outline: 0x9aaeb5,
    text: 0x16282f, muted: 0x435b66,
    auto: 0x16282f, blue: 0x155fa0, mint: 0x106d5b, gold: 0x825500, rose: 0xa72755, violet: 0x6347a4,
  },
}

Page({
  build() {
    this.settings = readSettings()
    this.widgets = []
    this.reading = null
    this.screen = 'main'
    this.foregroundHistory = readHistory(FOREGROUND)
    this.backgroundHistory = readHistory(BACKGROUND)
    this.historyReadAt = Date.now()
    try {
      this.barometer = new Barometer()
    } catch (error) {
      console.log('Barometer:', String(error))
    }
    this.alarmReady = syncSamplingAlarm(this.hasTrends())
    this.measure()
    this.render()
    this.timer = setInterval(() => this.measure(), 5000)
    onGesture({ callback: event => event === GESTURE_RIGHT && this.goBack() })
    onKey({ callback: (key, event) => key === KEY_BACK && event === KEY_EVENT_CLICK && this.goBack() })
  },

  onDestroy() {
    clearInterval(this.timer)
    offGesture()
    offKey()
  },

  hasTrends() {
    return this.settings.trends.some(trend => trend.enabled)
  },

  measure() {
    this.now = Date.now()
    this.pressure = readPressure(this.barometer)
    if (this.hasTrends()) {
      this.foregroundHistory = recordSample(FOREGROUND, this.foregroundHistory, this.now, this.pressure)
      if (this.now < this.historyReadAt || this.now - this.historyReadAt >= MINUTE / 2) {
        this.backgroundHistory = readHistory(BACKGROUND)
        this.historyReadAt = this.now
      }
    }
    if (this.screen === 'main' && this.reading) this.updateReadings()
  },

  open(screen) {
    this.screen = screen
    this.render()
  },

  goBack() {
    if (this.screen === 'main') return false
    const parents = { colors: 'appearance', period: 'trend', settings: 'main' }
    this.open(parents[this.screen] || 'settings')
    return true
  },

  pick(field, value) {
    this.settings[field] = value
    saveSettings(this.settings)
    this.goBack()
  },

  editTrend(field, value) {
    const hadTrends = this.hasTrends()
    this.settings.trends[this.trendIndex][field] = value
    saveSettings(this.settings)
    if (hadTrends !== this.hasTrends() || !this.alarmReady) {
      this.alarmReady = syncSamplingAlarm(this.hasTrends())
    }
    this.measure()
    this.render()
  },

  add(type, options) {
    const control = ui.createWidget(type, options)
    this.widgets.push(control)
    return control
  },

  text(text, x, y, w, h, textSize, color = this.palette.text) {
    return this.add(ui.widget.TEXT, {
      x, y, w, h, text, text_size: textSize, color,
      align_h: ui.align.CENTER_H, align_v: ui.align.CENTER_V,
    })
  },

  fill(x, y, w, h, color, radius = 0) {
    return this.add(ui.widget.FILL_RECT, { x, y, w, h, color, radius })
  },

  button(text, x, y, w, h, onClick, options = {}) {
    return this.add(ui.widget.BUTTON, {
      x, y, w, h, text, text_size: options.size || 25, radius: options.radius || 19,
      color: options.color ?? this.palette.text,
      normal_color: this.palette.surface,
      press_color: this.palette.pressed,
      click_func: onClick,
    })
  },

  title(title) {
    this.text(title, 70, 55, 340, 51, 30)
  },

  rows(items, y, rowGap = 58) {
    items.forEach(({ label, action, color }, index) => {
      this.button(label, 76, y + index * rowGap, 328, 50, action, { color })
    })
  },

  render() {
    for (const control of this.widgets) ui.deleteWidget(control)
    this.widgets = []
    this.palette = PALETTES[this.settings.theme]
    this.strings = STRINGS[this.settings.language]
    this.accent = this.palette[this.settings.color]
    this.fill(0, 0, 480, 480, this.palette.background)

    switch (this.screen) {
      case 'main': this.renderMain(); break
      case 'settings': this.renderSettings(); break
      case 'units': this.renderUnits(); break
      case 'language': this.renderLanguage(); break
      case 'appearance': this.renderAppearance(); break
      case 'colors': this.renderColors(); break
      case 'trend': this.renderTrend(); break
      case 'period': this.renderPeriod(); break
    }

    if (this.screen !== 'main') {
      this.button('‹', 199, 401, 82, 48, () => this.goBack(), { size: 36, radius: 24 })
    }
  },

  renderMain() {
    const { language, unit, trends } = this.settings
    const enabled = trends.filter(trend => trend.enabled)
    const offset = enabled.length ? 0 : 90
    this.text(this.strings.pressure, 80, 35 + offset, 320, 42, 28, this.palette.muted)
    this.reading = this.text('', 44, 75 + offset, 392, 150, 132, this.accent)
    this.readingUnit = this.text(UNITS[unit][language], 70, 215 + offset, 340, 33, 26, this.palette.muted)
    this.trendReadouts = enabled.map((trend, index) => {
      const w = 174
      const x = enabled.length === 1 ? (480 - w) / 2 : 59 + index * 188
      const frame = { x, y: 258, w, h: 112, radius: 22 }
      this.add(ui.widget.FILL_RECT, { ...frame, color: this.palette.surface }).setAlpha(112)
      this.add(ui.widget.STROKE_RECT, { ...frame, color: this.palette.outline, line_width: 1 })
      this.text(formatPeriod(trend.minutes, language), x, 266, w, 25, 20, this.palette.muted)
      return {
        trend,
        value: this.text('', x, 289, w, 48, 34, this.accent),
        status: this.text('', x, 337, w, 25, 17, this.palette.muted),
      }
    })
    const settingsIcon = 'settings-' + this.settings.theme
    this.add(ui.widget.BUTTON, {
      x: 194, y: 398, w: 92, h: 56, text: '',
      normal_src: settingsIcon + '.png',
      press_src: settingsIcon + '-pressed.png',
      click_func: () => this.open('settings'),
    })
    this.updateReadings()
  },

  updateReadings() {
    const { language, unit, showTenths } = this.settings
    const reading = formatPressure(this.pressure, unit, showTenths)
    this.reading.setProperty(ui.prop.MORE, { text: reading, text_size: reading.length > 5 ? 108 : 132 })
    this.readingUnit.setProperty(ui.prop.TEXT, this.pressure === null ? this.strings.unavailable : UNITS[unit][language])
    if (!this.trendReadouts.length) return
    const history = this.foregroundHistory.concat(this.backgroundHistory)
    for (const { trend, value, status } of this.trendReadouts) {
      const delta = pressureChange(history, this.now, this.pressure, trend.minutes)
      value.setProperty(ui.prop.TEXT, formatTrend(delta, unit, trend.mode))
      status.setProperty(ui.prop.TEXT, delta === null ? this.strings.collecting : '')
    }
  },

  renderSettings() {
    const t = this.strings
    this.title(t.settings)
    this.rows([
      { label: t.units + ' · ' + UNITS[this.settings.unit][this.settings.language], action: () => this.open('units') },
      { label: t.appearance, action: () => this.open('appearance') },
      { label: t.language, action: () => this.open('language') },
      ...this.settings.trends.map((trend, index) => ({
        label: t.trend + ' ' + (index + 1) + ' · ' + (trend.enabled
          ? formatPeriod(trend.minutes, this.settings.language) : t.off),
        action: () => {
          this.trendIndex = index
          this.open('trend')
        },
      })),
    ], 111, 56)
  },

  renderUnits() {
    this.title(this.strings.units)
    Object.keys(UNITS).forEach((unit, index) => {
      const row = Math.floor(index / 2)
      const x = 75 + (index % 2) * 168
      this.button(UNITS[unit][this.settings.language], x, 123 + row * 76, 162, 63,
        () => this.pick('unit', unit), { color: this.settings.unit === unit ? this.accentForSelection() : this.palette.text, size: 22 })
    })
  },

  renderLanguage() {
    this.title(this.strings.language)
    this.rows([
      { label: 'Русский', action: () => this.pick('language', 'ru'), color: this.optionColor('language', 'ru') },
      { label: 'English', action: () => this.pick('language', 'en'), color: this.optionColor('language', 'en') },
    ], 157, 69)
  },

  renderAppearance() {
    const t = this.strings
    const { theme, color, showTenths, unit } = this.settings
    this.title(t.appearance)
    this.rows([
      { label: t.theme + ' · ' + t[theme], action: () => {
        this.settings.theme = theme === 'dark' ? 'light' : 'dark'
        saveSettings(this.settings)
        this.render()
      } },
      { label: t.color + ' · ' + t[color], action: () => this.open('colors'), color: this.accent },
      { label: t.tenths + ' · ' + (showTenths ? t.on : t.off), action: () => {
        this.settings.showTenths = !showTenths
        saveSettings(this.settings)
        this.render()
      } },
    ], 120, 62)
    this.text(formatPressure(this.pressure, unit, showTenths), 90, 310, 300, 70, 48, this.accent)
  },

  renderColors() {
    this.title(this.strings.color)
    COLORS.forEach((color, index) => {
      const x = 75 + (index % 2) * 168
      const label = (this.settings.color === color ? '• ' : '') + this.strings[color]
      this.button(label, x, 123 + Math.floor(index / 2) * 76, 162, 63, () => {
        this.settings.color = color
        saveSettings(this.settings)
        this.open('appearance')
      }, { color: this.palette[color], size: 22 })
    })
  },

  accentForSelection() {
    return this.palette.mint
  },

  optionColor(field, value) {
    return this.settings[field] === value ? this.accentForSelection() : this.palette.text
  },

  renderTrend() {
    const t = this.strings
    const trend = this.settings.trends[this.trendIndex]
    this.title(t.trend + ' ' + (this.trendIndex + 1))
    this.rows([
      { label: trend.enabled ? t.on : t.off, action: () => this.editTrend('enabled', !trend.enabled),
        color: trend.enabled ? this.accentForSelection() : this.palette.text },
      { label: t.period + ' · ' + formatPeriod(trend.minutes, this.settings.language), action: () => this.open('period') },
      { label: t.format + ' · ' + t[trend.mode], action: () => this.editTrend('mode', trend.mode === 'arrow' ? 'sign' : 'arrow') },
    ], 129, 62)
    const demo = trend.mode === 'arrow' ? '↑ 3       ↓ 2' : '+3       −2'
    this.text(demo, 102, 319, 276, 49, 29, this.accent)
    if (trend.enabled && !this.alarmReady) {
      this.text(t.alarmError, 75, 365, 330, 26, 18, this.palette.muted)
    }
  },

  renderPeriod() {
    this.title(this.strings.period)
    const trend = this.settings.trends[this.trendIndex]
    PERIODS.forEach((minutes, index) => {
      const x = 75 + (index % 2) * 168
      this.button(formatPeriod(minutes, this.settings.language), x, 111 + Math.floor(index / 2) * 67, 162, 56, () => {
        this.screen = 'trend'
        this.editTrend('minutes', minutes)
      }, { color: trend.minutes === minutes ? this.accentForSelection() : this.palette.text })
    })
  },
})
