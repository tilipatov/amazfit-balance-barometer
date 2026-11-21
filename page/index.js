import * as ui from '@zos/ui'
import { Barometer } from '@zos/sensor'
import { GESTURE_DOWN, GESTURE_RIGHT, GESTURE_UP, KEY_BACK, KEY_EVENT_CLICK, KEY_HOME,
  onDigitalCrown, onGesture, onKey, offDigitalCrown, offGesture, offKey } from '@zos/interaction'
import { addSample, formatPeriod, formatPressure, formatTrend, MINUTE, PERIODS, pressureChange, trimHistory, UNITS } from '../lib/pressure.js'
import { CHART_PERIODS, chartTimeTicks, makeChart } from '../lib/chart.js'
import { BACKGROUND, FOREGROUND, readHistory, readPressure, recordSample } from '../lib/history.js'
import { CHART_COLORS, COLORS, readSettings, saveSettings } from '../lib/watch-data.js'
import { setBackgroundSampling } from '../lib/sampling.js'
import { STRINGS } from '../lib/strings.js'
import { APP_VERSION, CHUNK_SIZE, DIAGNOSTIC_METHOD } from '../lib/diagnostic-data.js'
import { readDiagnostics, recordDiagnostic } from '../lib/diagnostics.js'

const PALETTES = {
  dark: {
    background: 0x000000, surface: 0x223039, pressed: 0x344653, outline: 0x304148,
    text: 0xeaf3f8, muted: 0xa1b4c1,
    auto: 0xeaf3f8, blue: 0x366bc6, mint: 0x78decf, gold: 0xffd686, orange: 0xf68b3d, violet: 0x8660d9,
    red: 0xff6a70, green: 0x57cb84,
  },
  light: {
    background: 0xd6dddf, surface: 0xbdc9ce, pressed: 0xaebec4, outline: 0x9aaeb5,
    text: 0x16282f, muted: 0x435b66,
    auto: 0x16282f, blue: 0x123673, mint: 0x106d5b, gold: 0x825500, orange: 0x8c3e00, violet: 0x4a288a,
    red: 0xa92530, green: 0x21663a,
  },
}

const LOG_PAGE_SIZE = 4
const TELEGRAM_CHANNEL = 't.me/bytenenras'
const SCREEN_SIZE = 480
const MENU_TOP = 104
const MENU_HEIGHT = 287
const MENU_ROW_HEIGHT = 96
const CROWN_SCROLL_TIMEOUT = 800
const NAVIGATION_DELAY = 180
const SCROLL_QUIET_TIME = 250
const WORK_SPACING = 60
const PARENTS = {
  settings: 'main', graph: 'main', colors: 'appearance', theme: 'appearance', period: 'trend',
  chartPeriod: 'chartSettings', chartColors: 'chartSettings',
  diagnosticPeriod: 'diagnostics',
}

const twoDigits = value => ('0' + value).slice(-2)

// UI delays expire if the watch clock moves behind the start of the delay.
function remainingDelay(start, duration) {
  const elapsed = Date.now() - start
  return elapsed >= 0 ? Math.max(0, duration - elapsed) : 0
}

function formatTime(time) {
  const date = new Date(time)
  return twoDigits(date.getHours()) + ':' + twoDigits(date.getMinutes())
}

function formatLogDate(time) {
  const date = new Date(time)
  return date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) + '-' + twoDigits(date.getDate())
    + '  ' + formatTime(time)
}

function menuInset(screenY) {
  const radius = SCREEN_SIZE / 2
  const y = Math.max(MENU_TOP, Math.min(MENU_TOP + MENU_HEIGHT, screenY))
  const halfWidth = Math.sqrt(radius ** 2 - (y - radius) ** 2)
  return Math.ceil(radius - halfWidth) + 20
}

Page({
  build() {
    this.settings = readSettings()
    this.hintVisible = !this.settings.swipeHintSeen
    this.widgets = []
    this.reading = null
    this.backgroundStatus = null
    this.diagnosticStatus = null
    this.graphReadStatus = null
    this.graphOpening = false
    this.active = true
    this.screen = 'main'
    this.foregroundHistory = []
    this.backgroundHistory = []
    this.historyReadAt = -Infinity
    this.backgroundReady = null
    this.work = new Map()
    this.workTimer = undefined
    this.pauseForInteraction(NAVIGATION_DELAY)
    try {
      this.barometer = new Barometer()
    } catch (error) {
      console.log('Barometer:', String(error))
    }
    this.now = Date.now()
    this.readingAt = this.now
    this.pressure = readPressure(this.barometer)
    this.render()
    this.timer = setInterval(() => this.measure(), 5000)
    onGesture({ callback: event => this.handleGesture(event) })
    onKey({ callback: (key, event) => key === KEY_BACK && event === KEY_EVENT_CLICK && this.goBack() })
    onDigitalCrown({ callback: key => {
      if (key === KEY_HOME && this.menuRows.length) this.trackCrownScroll()
      return false
    } })
    this.queueWork('open-history', () => {
      this.foregroundHistory = readHistory(FOREGROUND) ?? this.foregroundHistory
      this.updateHistoryWidgets()
      this.queueSample()
    })
    this.queueWork('alarm', () => {
      this.backgroundReady = setBackgroundSampling(this.hasTrends(), this.settings.diagnosticMinutes)
      if (this.screen === 'trend' || this.screen === 'diagnostics') this.render()
    })
    this.queueBackgroundRefresh()
    if (this.hintVisible) {
      this.settings.swipeHintSeen = true
      this.queueWork('swipe-hint', () => saveSettings(this.settings))
    }
  },

  onDestroy() {
    this.active = false
    clearInterval(this.timer)
    if (this.workTimer !== undefined) clearTimeout(this.workTimer)
    this.work.clear()
    this.stopCrownTracking()
    offDigitalCrown()
    offGesture()
    offKey()
  },

  hasTrends() {
    return this.settings.trends.some(trend => trend.enabled)
  },

  queueWork(key, task) {
    this.work.set(key, task)
    this.scheduleWork()
  },

  pauseForInteraction(duration) {
    this.interactionAt = Date.now()
    this.interactionDelay = duration
  },

  scheduleWork() {
    if (!this.active || !this.work.size || this.workTimer !== undefined) return
    const delay = Math.max(WORK_SPACING, remainingDelay(this.interactionAt, this.interactionDelay))
    this.workTimer = setTimeout(() => {
      this.workTimer = undefined
      if (!this.active || !this.work.size) return
      if (remainingDelay(this.interactionAt, this.interactionDelay) === 0) {
        const [key, task] = this.work.entries().next().value
        this.work.delete(key)
        try {
          task()
        } catch (error) {
          console.log('Barometer maintenance:', String(error))
        }
      }
      this.scheduleWork()
    }, delay)
  },

  queueSample() {
    const { readingAt: now, pressure } = this
    if (addSample(this.foregroundHistory, now, pressure) === this.foregroundHistory) return
    this.queueWork('sample', () => {
      const previous = this.foregroundHistory
      this.foregroundHistory = recordSample(FOREGROUND, now, pressure, previous)
      if (previous !== this.foregroundHistory) this.updateHistoryWidgets()
    })
  },

  measure() {
    if (remainingDelay(this.interactionAt, this.interactionDelay) > 0) return
    this.now = Date.now()
    this.readingAt = this.now
    this.pressure = readPressure(this.barometer)
    if (this.hasTrends() || this.screen === 'graph') {
      if (this.now < this.historyReadAt || this.now - this.historyReadAt >= MINUTE / 2) {
        this.queueBackgroundRefresh()
      }
    }
    this.queueSample()
    if (this.screen === 'main' && this.reading) this.updateReadings()
    if (this.screen === 'graph' && Math.floor(this.now / MINUTE) !== this.chartRenderedMinute) {
      this.render()
    }
    if (this.screen === 'trend' && this.backgroundStatus) {
      this.backgroundStatus.setProperty(ui.prop.TEXT, this.backgroundStatusText())
    }
  },

  open(screen) {
    this.pauseForInteraction(NAVIGATION_DELAY)
    this.screen = screen
    if (screen === 'graph') {
      this.now = Date.now()
      this.graphOpening = true
      this.queueBackgroundRefresh()
    } else {
      this.graphOpening = false
      if (!this.hasTrends() && Number.isFinite(this.historyReadAt)) this.work.delete('background')
    }
    this.render()
  },

  handleGesture(event) {
    if (event === GESTURE_UP && this.screen === 'main') {
      this.hintVisible = false
      this.open('graph')
      return true
    }
    if (event === GESTURE_DOWN && this.screen === 'graph') return this.goBack()
    return event === GESTURE_RIGHT && this.goBack()
  },

  queueBackgroundRefresh() {
    this.queueWork('background', () => this.refreshBackgroundHistory())
  },

  updateHistoryWidgets() {
    if (this.screen === 'main') {
      this.updateReadings()
    } else if (this.screen === 'graph') {
      this.render()
    } else if (this.screen === 'trend' && this.backgroundStatus) {
      this.backgroundStatus.setProperty(ui.prop.TEXT, this.backgroundStatusText())
    }
  },

  refreshBackgroundHistory() {
    let history
    const previous = this.backgroundHistory
    const updated = readHistory(BACKGROUND, details => { history = details }) ?? previous
    const changed = updated.length !== previous.length
      || updated.some(([time, pressure], index) => time !== previous[index][0] || pressure !== previous[index][1])
    if (changed) this.backgroundHistory = updated
    this.historyReadAt = Date.now()
    if (this.screen !== 'graph') {
      if (changed) this.updateHistoryWidgets()
      return
    }

    const opening = this.graphOpening
    this.graphOpening = false
    const status = history.status + ':' + history.slots.join(',')
    const statusChanged = this.graphReadStatus !== status
    this.graphReadStatus = status
    this.now = this.historyReadAt
    if (opening || changed) this.render()
    if (opening || statusChanged || this.backgroundHistory.length < previous.length) {
      const now = this.now
      const period = this.settings.chartMinutes
      const start = now - period * MINUTE
      const visible = this.foregroundHistory.concat(this.backgroundHistory)
        .filter(([time]) => time >= start && time <= now).length
      const event = {
        time: now, kind: 'graph', opening, history, period,
        visible, foreground: this.foregroundHistory.length,
        cached: this.backgroundHistory.length, previous: previous.length,
        trendEnabled: this.hasTrends(), timerRegistered: this.backgroundReady,
        interval: this.settings.diagnosticMinutes,
      }
      this.queueWork(Symbol(), () => recordDiagnostic(event))
    }
  },

  goBack() {
    if (this.screen === 'main') return false
    this.open(PARENTS[this.screen] || 'settings')
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
    if (hadTrends !== this.hasTrends() || (field === 'enabled' && value && !this.backgroundReady)) {
      this.backgroundReady = setBackgroundSampling(this.hasTrends(), this.settings.diagnosticMinutes)
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

  menuText(text, x, y, w, h, size, color, align = ui.align.LEFT, wrap = false) {
    return this.menu.createWidget(ui.widget.TEXT, {
      x, y, w, h, text, color, text_size: size, align_h: align, align_v: ui.align.CENTER_V,
      text_style: wrap ? ui.text_style.WRAP : ui.text_style.NONE,
    })
  },

  menuList(title, items) {
    this.text(title, 59, 49, 362, 48, 34)
    items.forEach(({ label, action, detail, selected, color, icon }, index) => {
      const y = index * MENU_ROW_HEIGHT
      let decoration
      if (icon) {
        decoration = this.menu.createWidget(ui.widget.IMG, {
          x: 0, y: y + 30, src: 'menu-' + icon + '-' + this.settings.theme + '.png',
        })
      } else if (color !== undefined) {
        decoration = this.menu.createWidget(ui.widget.FILL_RECT, { x: 0, y: y + 38, w: 20, h: 20, radius: 10, color })
      }
      const labelWidget = this.menuText(label, 0, y + (detail ? 6 : 0), SCREEN_SIZE,
        detail ? 49 : MENU_ROW_HEIGHT, 36, this.palette.text, ui.align.LEFT, true)
      const detailWidget = detail ? this.menuText(detail, 0, y + 55, SCREEN_SIZE, 30, 22, this.palette.muted) : null
      const indicator = selected === false ? null : this.menuText(selected ? '✓' : '›', 0, y, 32, MENU_ROW_HEIGHT,
        30, selected ? this.palette.mint : this.palette.muted, ui.align.CENTER_H)

      // The native button is above the text and icons so any part of the row can be tapped.
      this.menu.createWidget(ui.widget.BUTTON, {
        x: 0, y, w: SCREEN_SIZE, h: MENU_ROW_HEIGHT, text: '',
        normal_src: 'menu-hit.png', press_src: 'menu-hit-pressed.png', click_func: action,
      })
      this.menuRows.push({ y, decoration, icon, color, labelWidget, detailWidget, indicator })
    })
    this.updateMenuOffset(0)
  },

  updateMenuOffset(value) {
    if (!Number.isFinite(value)) return
    const offset = Math.abs(value)
    if (offset === this.menuOffset) return
    if (this.menuOffset !== undefined) this.pauseForInteraction(SCROLL_QUIET_TIME)
    this.menuOffset = offset
    this.layoutMenuRows(offset)
  },

  layoutMenuRows(offset) {
    for (const row of this.menuRows) {
      const y = row.y - offset
      if (offset !== 0 && (y > MENU_HEIGHT || y + MENU_ROW_HEIGHT < 0)) continue
      const inset = menuInset(MENU_TOP + y + MENU_ROW_HEIGHT / 2)
      if (inset === row.inset) continue
      row.inset = inset
      const x = inset + (row.icon ? 43 : row.decoration ? 32 : 0)
      const right = SCREEN_SIZE - inset
      const w = right - x - (row.indicator ? 37 : 0)
      row.labelWidget.setProperty(ui.prop.MORE, {
        x, y: row.y + (row.detailWidget ? 6 : 0), w, h: row.detailWidget ? 49 : MENU_ROW_HEIGHT,
      })
      if (row.detailWidget) row.detailWidget.setProperty(ui.prop.MORE, { x, y: row.y + 55, w, h: 30 })
      if (row.indicator) row.indicator.setProperty(ui.prop.MORE, { x: right - 32, y: row.y, w: 32, h: MENU_ROW_HEIGHT })
      if (row.icon) row.decoration.setProperty(ui.prop.MORE, { x: inset, y: row.y + 30, w: 32, h: 36 })
      else if (row.decoration) {
        row.decoration.setProperty(ui.prop.MORE, { x: inset, y: row.y + 38, w: 20, h: 20, radius: 10, color: row.color })
      }
    }
  },

  trackCrownScroll() {
    this.crownScrollAt = Date.now()
    this.pauseForInteraction(SCROLL_QUIET_TIME)
    if (this.crownTracker !== undefined) return
    const menu = this.menu
    // Some firmware scrolls the view with the crown without sending scroll_frame_func.
    this.crownTracker = setInterval(() => {
      if (this.menu !== menu) {
        this.stopCrownTracking()
        return
      }
      const offset = ui.prop.POS_Y === undefined ? undefined : menu.getProperty(ui.prop.POS_Y)
      this.updateMenuOffset(Number.isFinite(offset) ? offset : menu.getProperty(ui.prop.MORE, {})?.pos_y)
      if (remainingDelay(this.crownScrollAt, CROWN_SCROLL_TIMEOUT) === 0) this.stopCrownTracking()
    }, 32)
  },

  stopCrownTracking() {
    if (this.crownTracker === undefined) return
    clearInterval(this.crownTracker)
    this.crownTracker = undefined
  },

  render() {
    this.stopCrownTracking()
    for (const control of this.widgets) ui.deleteWidget(control)
    this.widgets = []
    this.menuRows = []
    this.menuOffset = undefined
    this.backgroundStatus = null
    this.palette = PALETTES[this.settings.theme]
    this.strings = STRINGS[this.settings.language]
    this.accent = this.palette[this.settings.color]
    this.fill(0, 0, 480, 480, this.palette.background)
    const menuScreen = this.screen !== 'main' && this.screen !== 'graph'
    let menu
    if (menuScreen) {
      menu = this.add(ui.widget.VIEW_CONTAINER, {
        x: 0, y: MENU_TOP, w: SCREEN_SIZE, h: MENU_HEIGHT, scroll_enable: 1, bounce: 0,
        scroll_frame_func: info => {
          if (menu && this.menu === menu) this.updateMenuOffset(info?.yoffset)
        },
      })
    }
    this.menu = menu

    switch (this.screen) {
      case 'main': this.renderMain(); break
      case 'settings': this.renderSettings(); break
      case 'units': this.renderUnits(); break
      case 'language': this.renderLanguage(); break
      case 'appearance': this.renderAppearance(); break
      case 'colors': this.renderColors(); break
      case 'trend': this.renderTrend(); break
      case 'period': this.renderPeriod(); break
      case 'log': this.renderLog(); break
      case 'diagnostics': this.renderDiagnostics(); break
      case 'diagnosticPeriod': this.renderDiagnosticPeriod(); break
      case 'graph': this.renderGraph(); break
      case 'theme': this.renderTheme(); break
      case 'chartSettings': this.renderChartSettings(); break
      case 'chartPeriod': this.renderChartPeriod(); break
      case 'chartColors': this.renderChartColors(); break
      case 'help': this.renderHelp(); break
      case 'about': this.renderAbout(); break
    }

    if (menuScreen) {
      this.add(ui.widget.BUTTON, {
        x: 194, y: 399, w: 92, h: 53, text: '‹', text_size: 38,
        normal_color: this.palette.background, press_color: this.palette.surface,
        color: this.palette.text, click_func: () => this.goBack(),
      })
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
      x: 194, y: this.hintVisible ? 410 : 398, w: 92, h: 56, text: '',
      normal_src: settingsIcon + '.png',
      press_src: settingsIcon + '-pressed.png',
      click_func: () => this.open('settings'),
    })
    if (this.hintVisible) {
      this.button('↑  ' + this.strings.swipeHint + '   ×', 89, 371, 302, 38, () => {
        this.hintVisible = false
        this.render()
      }, { size: 18, color: this.palette.text })
    }
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
    const { language, unit, trends } = this.settings
    this.menuList(t.settings, [
      { label: t.units, icon: 'units', detail: UNITS[unit][language], action: () => this.open('units') },
      { label: t.appearance, icon: 'appearance', action: () => this.open('appearance') },
      { label: t.language, icon: 'language', detail: language === 'ru' ? 'Русский' : 'English', action: () => this.open('language') },
      ...trends.map((trend, index) => ({
        label: t.trend + ' ' + (index + 1),
        icon: 'trend-' + (index + 1),
        detail: trend.enabled ? formatPeriod(trend.minutes, language) : t.off,
        action: () => {
          this.trendIndex = index
          this.open('trend')
        },
      })),
      { label: t.chart, icon: 'chart', action: () => this.open('chartSettings') },
      { label: t.log, icon: 'log', action: () => this.openLog() },
      { label: t.diagnostics, icon: 'log', action: () => this.open('diagnostics') },
      { label: t.help, icon: 'help', action: () => this.open('help') },
      { label: t.about, icon: 'about', action: () => this.open('about') },
    ])
  },

  renderDiagnostics() {
    const t = this.strings
    const interval = formatPeriod(this.settings.diagnosticMinutes, this.settings.language)
    this.menuList(t.diagnostics, [
      { label: t.diagnosticSend, icon: 'log', action: () => this.sendDiagnostics() },
      {
        label: t.diagnosticPeriod,
        detail: this.hasTrends() && this.backgroundReady === false ? interval + ' · ' + t.diagnosticTimerFailed : interval,
        action: () => this.open('diagnosticPeriod'),
      },
    ])
    this.menuText(this.diagnosticStatus ? t[this.diagnosticStatus] : t.diagnosticHelp,
      82, 192, 316, 100, 22, this.palette.muted, ui.align.LEFT, true)
  },

  renderDiagnosticPeriod() {
    this.menuList(this.strings.diagnosticPeriod, [5, 10].map(minutes => ({
      label: formatPeriod(minutes, this.settings.language),
      selected: this.settings.diagnosticMinutes === minutes,
      action: () => {
        this.settings.diagnosticMinutes = minutes
        saveSettings(this.settings)
        this.backgroundReady = setBackgroundSampling(this.hasTrends(), minutes)
        this.open('diagnostics')
      },
    })))
  },

  sendDiagnostics() {
    if (this.diagnosticStatus === 'diagnosticSending') return
    this.diagnosticStatus = 'diagnosticSending'
    this.render()
    this.queueWork('send-diagnostics', () => this.transferDiagnostics())
  },

  async transferDiagnostics() {
    try {
      const time = Date.now()
      const { events, unavailable, stores } = readDiagnostics(time)
      const total = Math.max(1, Math.ceil(events.length / CHUNK_SIZE))
      for (let index = 0; index < total; index++) {
        if (!this.active) return
        const offset = index * CHUNK_SIZE
        const reply = await getApp()._options.globalData.requestDiagnostic({
          method: DIAGNOSTIC_METHOD,
          params: {
            time, language: this.settings.language, index, total, unavailable, stores,
            events: events.slice(offset, offset + CHUNK_SIZE),
          },
        })
        if (reply?.index !== index || reply?.complete !== (index === total - 1)) {
          throw new Error('Unexpected diagnostic reply')
        }
      }
      this.diagnosticStatus = unavailable.length ? 'diagnosticPartial' : 'diagnosticSent'
    } catch (error) {
      console.log('Diagnostic transfer:', String(error))
      this.diagnosticStatus = 'diagnosticFailed'
    }
    if (this.active && this.screen === 'diagnostics') this.render()
  },

  openLog() {
    this.logPage = 0
    this.logLoading = true
    this.updateLogEntries()
    this.open('log')
    this.queueWork('log', () => {
      if (this.screen !== 'log') return
      this.foregroundHistory = readHistory(FOREGROUND) ?? this.foregroundHistory
      this.backgroundHistory = readHistory(BACKGROUND) ?? this.backgroundHistory
      this.historyReadAt = Date.now()
      this.logLoading = false
      this.updateLogEntries()
      this.render()
    })
  },

  updateLogEntries() {
    const now = Date.now()
    const foreground = trimHistory(this.foregroundHistory, now)
    const background = trimHistory(this.backgroundHistory, now)
    this.logEntries = foreground.map(([time, pressure]) => ({ time, pressure, background: false }))
      .concat(background.map(([time, pressure]) => ({ time, pressure, background: true })))
      .sort((left, right) => right.time - left.time)
    this.logPage = Math.min(this.logPage, Math.max(0, Math.ceil(this.logEntries.length / LOG_PAGE_SIZE) - 1))
  },

  renderLog() {
    const t = this.strings
    const { unit, language, showTenths } = this.settings
    this.text(t.log, 70, 48, 340, 42, 30)
    const latestBackground = this.logEntries.find(entry => entry.background)
    this.menuText(t.logLastBackground, 84, 0, 312, 24, 19, this.palette.muted)
    this.menuText(latestBackground ? formatLogDate(latestBackground.time) : '—',
      84, 25, 312, 28, 22, this.accent)
    if (!this.logEntries.length) {
      this.menuText(this.logLoading ? t.chartLoading : t.logEmpty,
        84, 83, 310, 100, 26, this.palette.text, ui.align.LEFT, true)
      return
    }
    const start = this.logPage * LOG_PAGE_SIZE
    this.logEntries.slice(start, start + LOG_PAGE_SIZE).forEach((entry, index) => {
      const y = 60 + 54 * index
      const reading = formatPressure(entry.pressure, unit, showTenths) + ' ' + UNITS[unit][language]
      const hint = entry.background ? t.logBackground : t.logForeground
      this.menuText(reading, 84, y, 310, 30, 24, this.palette.text)
      this.menuText(formatLogDate(entry.time) + '  ·  ' + hint, 84, y + 28, 320, 25, 16, this.palette.muted)
    })
    const pages = Math.ceil(this.logEntries.length / LOG_PAGE_SIZE)
    if (pages <= 1) return
    this.text((this.logPage + 1) + ' / ' + pages, 180, 90, 120, 22, 16, this.palette.muted)
    if (this.logPage > 0) {
      this.add(ui.widget.BUTTON, {
        x: 124, y: 399, w: 64, h: 48, text: '‹', text_size: 30, color: this.palette.text,
        normal_color: this.palette.background, press_color: this.palette.surface,
        click_func: () => { this.logPage--; this.render() },
      })
    }
    if (this.logPage + 1 < pages) {
      this.add(ui.widget.BUTTON, {
        x: 292, y: 399, w: 64, h: 48, text: '›', text_size: 30, color: this.palette.text,
        normal_color: this.palette.background, press_color: this.palette.surface,
        click_func: () => { this.logPage++; this.render() },
      })
    }
  },

  renderUnits() {
    const { language, unit } = this.settings
    this.menuList(this.strings.units, Object.keys(UNITS).map(key => ({
      label: UNITS[key][language], selected: key === unit, action: () => this.pick('unit', key),
    })))
  },

  renderLanguage() {
    const { language } = this.settings
    this.menuList(this.strings.language, [
      { label: 'Русский', selected: language === 'ru', action: () => this.pick('language', 'ru') },
      { label: 'English', selected: language === 'en', action: () => this.pick('language', 'en') },
    ])
  },

  renderAppearance() {
    const t = this.strings
    const { theme, color, showTenths } = this.settings
    this.menuList(t.appearance, [
      { label: t.theme, detail: t[theme], action: () => this.open('theme') },
      { label: t.color, detail: t[color], action: () => this.open('colors') },
      { label: t.tenths, detail: showTenths ? t.on : t.off, action: () => {
        this.settings.showTenths = !showTenths
        saveSettings(this.settings)
        this.render()
      } },
    ])
  },

  renderTheme() {
    this.menuList(this.strings.theme, ['dark', 'light'].map(theme => ({
      label: this.strings[theme], selected: theme === this.settings.theme, action: () => this.pick('theme', theme),
    })))
  },

  renderColors() {
    this.renderColorList(this.strings.color, 'color', COLORS)
  },

  renderChartColors() {
    this.renderColorList(this.strings.chartColor, 'chartColor', CHART_COLORS)
  },

  renderColorList(title, field, colors) {
    this.menuList(title, colors.map(color => ({
      label: this.strings[color],
      color: this.palette[color],
      selected: color === this.settings[field],
      action: () => this.pick(field, color),
    })))
  },

  renderTrend() {
    const t = this.strings
    const trend = this.settings.trends[this.trendIndex]
    this.menuList(t.trend + ' ' + (this.trendIndex + 1), [
      { label: t.trend, detail: trend.enabled ? t.on : t.off, action: () => this.editTrend('enabled', !trend.enabled) },
      { label: t.period, detail: formatPeriod(trend.minutes, this.settings.language), action: () => this.open('period') },
      { label: t.format, detail: t[trend.mode], action: () => this.editTrend('mode', trend.mode === 'arrow' ? 'sign' : 'arrow') },
    ])
    this.backgroundStatus = this.menuText(this.backgroundStatusText(), 84, MENU_ROW_HEIGHT * 3 + 6, 310, 56, 19,
      this.palette.muted, ui.align.LEFT, true)
  },

  backgroundStatusText() {
    if (!this.settings.trends[this.trendIndex].enabled) return ''
    const t = this.strings
    if (this.backgroundReady === false) return t.backgroundUnavailable
    const last = this.backgroundHistory[this.backgroundHistory.length - 1]
    if (!last || last[0] > this.now) return t.backgroundWaiting
    const minutes = Math.floor((this.now - last[0]) / MINUTE)
    return t.backgroundLast + ' ' + minutes + ' ' + t.minutesAgo
  },

  renderPeriod() {
    const { minutes: current } = this.settings.trends[this.trendIndex]
    this.menuList(this.strings.period, PERIODS.map(minutes => ({
      label: formatPeriod(minutes, this.settings.language), selected: minutes === current,
      action: () => {
        this.screen = 'trend'
        this.editTrend('minutes', minutes)
      },
    })))
  },

  renderChartSettings() {
    const { chartMinutes, chartColor, language } = this.settings
    const t = this.strings
    this.menuList(t.chart, [
      { label: t.period, detail: formatPeriod(chartMinutes, language), action: () => this.open('chartPeriod') },
      { label: t.chartColor, detail: t[chartColor], action: () => this.open('chartColors') },
    ])
  },

  renderChartPeriod() {
    this.menuList(this.strings.period, CHART_PERIODS.map(minutes => ({
      label: formatPeriod(minutes, this.settings.language),
      selected: minutes === this.settings.chartMinutes,
      action: () => this.pick('chartMinutes', minutes),
    })))
  },

  renderHelp() {
    const t = this.strings
    this.text(t.help, 57, 51, 366, 45, 30)
    this.menuText(t.helpChart, 78, 12, 324, 162, 26, this.palette.text, ui.align.LEFT, true)
    this.menuText(t.helpTrends, 78, 184, 324, 201, 26, this.palette.text, ui.align.LEFT, true)
  },

  renderAbout() {
    const t = this.strings
    this.text(t.about, 66, 51, 348, 45, 31)
    this.menuText(APP_VERSION + ' · ' + t.diagnostics,
      80, 0, 320, 28, 21, this.palette.muted, ui.align.CENTER_H)
    this.menuText(TELEGRAM_CHANNEL, 80, 29, 320, 28, 22, this.palette.text, ui.align.CENTER_H)
    this.menu.createWidget(ui.widget.IMG, { x: 128, y: 62, src: 'telegram-qr.png' })
  },

  renderGraph() {
    const { chartMinutes, chartColor, language, unit, showTenths } = this.settings
    const now = this.now
    this.chartRenderedMinute = Math.floor(now / MINUTE)
    this.text(this.strings.chart + ' · ' + formatPeriod(chartMinutes, language), 66, 49, 348, 44, 28)
    this.text(this.strings.chartNow + ' ' + formatTime(now), 100, 377, 280, 42, 23, this.palette.text)
    const chart = makeChart(this.foregroundHistory.concat(this.backgroundHistory), now, chartMinutes, unit)
    if (!chart.points.length) {
      this.text(this.graphOpening ? this.strings.chartLoading : this.strings.chartEmpty,
        75, 205, 330, 70, 27, this.palette.muted)
      return
    }

    const color = this.palette[chartColor]
    const latest = chart.points[chart.points.length - 1]
    const lastReading = formatPressure(latest.pressure, unit, showTenths) + ' ' + UNITS[unit][language]
    this.text(lastReading, 60, 94, 360, 54, 39, this.palette.text)
    this.text(this.strings.chartLatest + ' ' + formatTime(latest.time), 60, 147, 360, 28, 18, this.palette.muted)
    const plotX = 34
    const plotY = 186
    const pad = 4
    const width = 362
    const height = 136
    const canvas = this.add(ui.widget.CANVAS, { x: plotX, y: plotY, w: width + 2 * pad + 1, h: height + 2 * pad + 1 })
    canvas.setPaint({ color: this.palette.outline, line_width: 1 })
    const tickDigits = Math.max(UNITS[unit].digits, 1)
    for (const fraction of [0, 0.5, 1]) {
      const y = pad + Math.round(fraction * height)
      canvas.drawLine({ x1: pad, y1: y, x2: pad + width, y2: y, color: this.palette.outline })
      const value = chart.top - fraction * (chart.top - chart.bottom)
      this.text(value.toFixed(tickDigits), 404, plotY + y - 12, 60, 24, 16, this.palette.muted)
    }
    for (const time of chartTimeTicks(chart.start, now)) {
      const x = pad + Math.round((time - chart.start) / (now - chart.start) * width)
      canvas.drawLine({ x1: x, y1: pad, x2: x, y2: pad + height, color: this.palette.outline })
      const labelX = Math.max(34, plotX + x - 31)
      this.text(formatTime(time), labelX, 334, 62, 30, 18, this.palette.muted)
    }

    canvas.setPaint({ color, line_width: 3 })
    const points = chart.points.map(point => ({
      x: pad + Math.round(point.x * width),
      y: pad + Math.round(point.y * height),
      connect: point.connect,
    }))
    points.forEach((point, index) => {
      const { x, y } = point
      if (point.connect) {
        const previous = points[index - 1]
        canvas.drawLine({ x1: previous.x, y1: previous.y, x2: x, y2: y, color })
      } else if (!points[index + 1]?.connect) {
        canvas.drawLine({ x1: Math.max(pad, x - 3), y1: y, x2: Math.min(pad + width, x + 3), y2: y, color })
      }
    })
  },
})
