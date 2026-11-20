import { BETA_VERSION, DIAGNOSTIC_STORAGE, readDiagnosticSnapshot } from '../lib/diagnostic-data.js'

const PAGE_SIZE = 40
const PAGE_KEY = 'barometer-diagnostics-page'
const strings = {
  ru: {
    title: 'Барометр · Диагностика',
    synced: 'Последняя передача',
    empty: 'За последние сутки нет событий.',
    more: 'Показать ещё',
    less: 'Показать только свежие',
    background: 'Фоновая задача запущена',
    graph: 'График открыт',
    refreshed: 'История графика обновлена',
    history: 'Файл истории',
    loaded: 'прочитан',
    missing: 'отсутствует',
    unreadable: 'существует, но не читается',
    invalid: 'ошибка формата',
    'read-error': 'ошибка чтения',
    saved: 'замер сохранён и проверен',
    duplicate: 'замер пропущен по интервалу',
    unverified: 'запись не подтвердилась',
    'history-error': 'запись пропущена из-за ошибки чтения',
    'sensor-error': 'датчик не вернул показание',
    'write-error': 'ошибка записи',
    'unexpected-error': 'ошибка фоновой задачи',
    points: 'Точек на графике',
    rejected: 'отброшено записей',
    previous: 'фоновых точек в памяти',
    foreground: 'замеров в приложении',
    registered: 'таймер зарегистрирован',
    notRegistered: 'таймер не зарегистрирован',
    unavailable: 'Часть журнала на часах не прочиталась',
    backgroundSource: 'фон',
    graphSource: 'график',
    hpa: 'гПа',
    hours: 'ч',
  },
  en: {
    title: 'Barometer · Diagnostics',
    synced: 'Last transfer',
    empty: 'No events in the last 24 hours.',
    more: 'Show more',
    less: 'Show newest only',
    background: 'Background task started',
    graph: 'Chart opened',
    refreshed: 'Chart history refreshed',
    history: 'History file',
    loaded: 'loaded',
    missing: 'missing',
    unreadable: 'exists but could not be read',
    invalid: 'invalid format',
    'read-error': 'read failed',
    saved: 'reading saved and verified',
    duplicate: 'reading skipped due to sampling interval',
    unverified: 'write could not be verified',
    'history-error': 'write skipped after read failure',
    'sensor-error': 'no reading from sensor',
    'write-error': 'write failed',
    'unexpected-error': 'background task failed',
    points: 'Chart points',
    rejected: 'rejected entries',
    previous: 'cached background readings',
    foreground: 'in-app readings',
    registered: 'timer registered',
    notRegistered: 'timer not registered',
    unavailable: 'Some of the watch log could not be read',
    backgroundSource: 'background',
    graphSource: 'chart',
    hpa: 'hPa',
    hours: 'h',
  },
}

function showTime(time) {
  const date = new Date(time)
  const two = value => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate())
    + ' ' + two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds())
}

function describeEvent(event, t) {
  const parts = []
  if (event.kind === 'background') {
    parts.push(t[event.result])
    if (Number.isFinite(event.pressure)) parts.push(event.pressure + ' ' + t.hpa)
  } else {
    parts.push(t.points + ': ' + event.visible + ' / ' + event.period / 60 + ' ' + t.hours)
    parts.push(event.previous + ' → ' + event.cached + ' ' + t.previous)
    parts.push(event.foreground + ' ' + t.foreground)
    parts.push(event.timerRegistered ? t.registered : t.notRegistered)
  }
  const history = event.history
  if (history) {
    let summary = t.history + ': ' + t[history.status]
    if (history.status === 'loaded') {
      summary += ' (' + history.count + ')'
      if (history.count > 0) summary += ' · ' + showTime(history.first) + ' — ' + showTime(history.last)
      if (history.rejected) summary += ' · ' + t.rejected + ': ' + history.rejected
    }
    parts.push(summary)
  }
  return parts.filter(Boolean).join(' · ')
}

AppSettingsPage({
  build({ settingsStorage }) {
    const snapshot = readDiagnosticSnapshot(settingsStorage.getItem(DIAGNOSTIC_STORAGE))
    if (!snapshot) {
      return Section({ title: 'Барометр · Диагностика / Barometer · Diagnostics' }, [
        Text({ bold: true }, BETA_VERSION),
        Text({}, 'На часах: Настройки → Диагностика → Передать журнал в Zepp.'),
        Text({}, 'On the watch: Settings → Diagnostics → Send log to Zepp.'),
      ])
    }

    const t = strings[snapshot.language] || strings.en
    const events = snapshot.events
    const page = Math.max(1, Number(settingsStorage.getItem(PAGE_KEY)) || 1)
    const limit = page * PAGE_SIZE
    const sections = [
      Section({ title: t.title }, [
        Text({ bold: true }, BETA_VERSION),
        Text({}, t.synced + ': ' + showTime(snapshot.syncedAt)),
      ]),
    ]
    if (snapshot.unavailable?.length) {
      const sources = snapshot.unavailable.map(kind => kind === 'background' ? t.backgroundSource : t.graphSource)
      sections.push(Text({ bold: true }, t.unavailable + ' (' + sources.join(', ') + ')'))
    }
    if (!events.length) sections.push(Text({}, t.empty))
    for (const event of events.slice(-limit).reverse()) {
      const title = event.kind === 'background' ? t.background : event.opening ? t.graph : t.refreshed
      sections.push(Section({ title: showTime(event.time) }, [
        Text({ bold: true }, title),
        Text({}, describeEvent(event, t)),
      ]))
    }
    if (limit < events.length) {
      sections.push(Button({ label: t.more, onClick: () => settingsStorage.setItem(PAGE_KEY, String(page + 1)) }))
    }
    if (page > 1) {
      sections.push(Button({ label: t.less, onClick: () => settingsStorage.setItem(PAGE_KEY, '1') }))
    }
    return View({}, sections)
  },
})
