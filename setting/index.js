import { APP_VERSION, DIAGNOSTIC_STORAGE, readDiagnosticSnapshot } from '../lib/diagnostic-data.js'

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
    recovered: 'данные восстановлены',
    backup: 'используется рабочая копия',
    restored: 'восстановлено записей',
    slots: 'состояние копий',
    interval: 'Интервал таймера',
    diagnosticFile: 'Файл диагностики',
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
    minutes: 'мин',
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
    recovered: 'data recovered',
    backup: 'using the intact copy',
    restored: 'recovered entries',
    slots: 'copy status',
    interval: 'Timer interval',
    diagnosticFile: 'Diagnostic log file',
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
    minutes: 'min',
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
  if (event.interval) parts.push(t.interval + ': ' + event.interval + ' ' + t.minutes)
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
    let summary = t.history + ': ' + describeHealth(history, t)
    if (history.count !== undefined) {
      summary += ' (' + history.count + ')'
      if (history.count > 0) summary += ' · ' + showTime(history.first) + ' — ' + showTime(history.last)
    }
    if (history.rejected) summary += ' · ' + t.rejected + ': ' + history.rejected
    parts.push(summary)
  }
  if (event.logHealth) parts.push(t.diagnosticFile + ': ' + describeHealth(event.logHealth, t))
  return parts.filter(Boolean)
}

function describeHealth(health, t) {
  const details = [t[health.status]]
  if (health.recovered !== undefined) details.push(t.restored + ': ' + health.recovered)
  if (health.backup) details.push(t.backup)
  if (health.slots) details.push(t.slots + ': ' + health.slots.map(status => t[status]).join(' / '))
  return details.filter(Boolean).join(' · ')
}

function line(value, bold = false) {
  return View({ style: { display: 'flex', flexDirection: 'column', marginBottom: '6px' } }, [
    Text({ bold, paragraph: true }, value),
  ])
}

AppSettingsPage({
  build({ settingsStorage }) {
    const snapshot = readDiagnosticSnapshot(settingsStorage.getItem(DIAGNOSTIC_STORAGE))
    if (!snapshot) {
      return View({ style: { padding: '12px' } }, [
        Section({ title: 'Барометр · Диагностика / Barometer · Diagnostics' }, [
          line(APP_VERSION, true),
          line('На часах: Настройки → Диагностика → Передать журнал в Zepp.'),
          line('On the watch: Settings → Diagnostics → Send log to Zepp.'),
        ]),
      ])
    }

    const t = strings[snapshot.language] || strings.en
    const events = snapshot.events
    const page = Math.max(1, Number(settingsStorage.getItem(PAGE_KEY)) || 1)
    const limit = page * PAGE_SIZE
    const sections = [
      Section({ title: t.title }, [
        line(APP_VERSION, true),
        line(t.synced + ': ' + showTime(snapshot.syncedAt)),
      ]),
    ]
    if (snapshot.unavailable?.length) {
      const sources = snapshot.unavailable.map(kind => kind === 'background' ? t.backgroundSource : t.graphSource)
      sections.push(line(t.unavailable + ' (' + sources.join(', ') + ')', true))
    }
    if (snapshot.stores) {
      const sources = [
        [t.backgroundSource, snapshot.stores.background], [t.graphSource, snapshot.stores.graph],
      ]
      for (const [name, health] of sources) {
        if (health && (health.backup || health.status !== 'loaded')) {
          sections.push(line(t.diagnosticFile + ' (' + name + '): ' + describeHealth(health, t)))
        }
      }
    }
    if (!events.length) sections.push(line(t.empty))
    for (const event of events.slice(-limit).reverse()) {
      const title = event.kind === 'background' ? t.background : event.opening ? t.graph : t.refreshed
      sections.push(Section({ title: showTime(event.time) }, [
        line(title, true),
        ...describeEvent(event, t).map(detail => line(detail)),
      ]))
    }
    if (limit < events.length) {
      sections.push(Button({ label: t.more, onClick: () => settingsStorage.setItem(PAGE_KEY, String(page + 1)) }))
    }
    if (page > 1) {
      sections.push(Button({ label: t.less, onClick: () => settingsStorage.setItem(PAGE_KEY, '1') }))
    }
    return View({ style: { padding: '12px' } }, sections)
  },
})
