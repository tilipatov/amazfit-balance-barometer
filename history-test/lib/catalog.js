// Paths in this report are relative to the storage exposed by the selected app.
const maxNames = 64
const maxDirectories = 32
const maxText = 2400

export async function scanCatalog(fs, pause = () => Promise.resolve()) {
  if (typeof fs.readdirSync !== 'function') {
    return { summary: 'Прошивка не предоставляет список папок через FileSystem.', lines: ['Метод readdirSync у хранилища штатного барометра отсутствует.'] }
  }

  let root
  const errors = []
  for (const path of ['.', '']) {
    try {
      root = fs.readdirSync({ path })
      if (Array.isArray(root)) break
      errors.push('Нет списка для ' + JSON.stringify(path))
    } catch (error) {
      errors.push(String(error).slice(0, 120))
    }
  }
  if (!Array.isArray(root)) return { summary: 'Каталог барометра не открылся.', lines: errors }

  const queue = [{ path: '', names: root }]
  const lines = []
  let firstMatch = ''
  let count = 0
  let textSize = 0
  let limited = false
  let dirCount = 0
  for (let i = 0; i < queue.length && !limited; i++) {
    if (i >= maxDirectories) { limited = true; break }
    const dir = queue[i]
    let names = dir.names
    if (!names) {
      if (i % 4 === 0) await pause()
      try {
        names = fs.readdirSync({ path: dir.path })
      } catch (error) {
        if (dir.knownDir) lines.push('Ошибка каталога ' + dir.path + ' · ' + String(error).slice(0, 80))
        continue
      }
      if (!Array.isArray(names)) {
        if (dir.knownDir) lines.push('Каталог недоступен · ' + dir.path)
        continue
      }
    }
    dirCount++
    for (const name of names) {
      if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/:\x00-\x1f]/.test(name)) continue
      const path = dir.path ? dir.path + '/' + name : name
      if (count >= maxNames || textSize + path.length > maxText) { limited = true; break }
      count++
      textSize += path.length
      let info
      if (typeof fs.statSync === 'function') {
        try { info = fs.statSync({ path }) } catch (_) {}
      }
      const isDir = info && info.isDir === true
      const size = info && info.isFile === true && Number.isFinite(info.size) ? ' · ' + info.size + ' Б' : ''
      lines.push(path + (isDir ? '/' : '') + size)
      if (!isDir && name.toLowerCase() === 'pressure.dat' && !firstMatch) firstMatch = path
      if (!info || info.isFile !== true) queue.push({ path, knownDir: isDir })
    }
  }
  const summary = firstMatch ? 'Найдено имя · ' + firstMatch : count === 0 ? 'Каталог открыт. Список пуст.' : 'В полученном списке имени pressure.dat нет.'
  lines.unshift('Открыто каталогов · ' + dirCount + '. Имен в отчёте · ' + count + '.')
  if (limited) lines.unshift('Достигнут лимит просмотра. Список частичный.')
  if (typeof fs.statSync !== 'function') lines.push('Типы и размеры недоступны. Вложенные папки видны только при успешном чтении списка.')
  return { summary, lines }
}
