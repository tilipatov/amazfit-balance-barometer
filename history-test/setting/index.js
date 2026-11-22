AppSettingsPage({
  build({ settingsStorage }) {
    const raw = settingsStorage.getItem('catalog-report')
    const report = raw && JSON.parse(raw)
    const lines = report
      ? [new Date(report.time).toLocaleString(), report.summary, ...report.lines]
      : ['На часах откройте «Каталог барометра» и нажмите «Отправить в Zepp».']
    return View({ style: { padding: '12px' } }, [
      Section({ title: 'Тест 4 · Каталог штатного барометра' }, lines.map(line =>
        View({ style: { marginBottom: '6px' } }, [Text({ paragraph: true }, line)])
      )),
    ])
  },
})
