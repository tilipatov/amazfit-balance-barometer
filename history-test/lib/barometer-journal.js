// Reader for the pressure journal written by Barometer+ 1.1.6.
const historyWindow = (1440 + 15) * 60000

function checksum(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

function valid(sample) {
  return Array.isArray(sample) && Number.isFinite(sample[0]) && Number.isFinite(sample[1])
    && sample[1] > 0 && sample[1] <= 1300
}

function readCopy(fs, path, legacy) {
  try {
    const text = fs.readFileSync({ path, options: { encoding: 'utf8' } })
    if (typeof text !== 'string') throw new Error('Нет текста')
    let generation = 0
    let body = text
    if (!legacy) {
      const end = text.indexOf('\n')
      const header = /^(\d+) (\d+) ([\da-f]+)$/.exec(text.slice(0, end))
      body = text.slice(end + 1)
      if (!header || end < 0) throw new Error('Формат')
      generation = Number(header[1])
      if (!Number.isSafeInteger(generation) || generation < 1 ||
          Number(header[2]) !== body.length || checksum(body) !== header[3]) throw new Error('Копия повреждена')
    }
    const samples = JSON.parse(body)
    if (!Array.isArray(samples) || (!legacy && !samples.every(valid))) throw new Error('Формат замеров')
    return { generation, samples: legacy ? samples.filter(valid) : samples }
  } catch (error) {
    return { error: String(error.message || error) }
  }
}

function readStream(fs, path) {
  const a = readCopy(fs, path + '.a', false)
  const b = readCopy(fs, path + '.b', false)
  if (a.samples && (!b.samples || a.generation > b.generation)) return a
  if (b.samples) return b
  const legacy = readCopy(fs, path, true)
  if (legacy.samples) return legacy
  const reasons = [a.error, b.error, legacy.error]
  return { error: reasons.find(reason => !/not exist|not found/i.test(reason)) || a.error }
}

export function journalReport(fs, now) {
  const lines = ['Тест 3 · журнал Барометра+']
  let last
  for (const [name, path] of [['В приложении', 'pressure-open.json'], ['Фон', 'pressure-background.json']]) {
    const stream = readStream(fs, path)
    if (!stream.samples) {
      lines.push(name + ': ' + stream.error)
      continue
    }
    const visible = stream.samples.filter(([time]) => time <= now && time >= now - historyWindow)
    lines.push(name + ': ' + visible.length + ' зам.')
    for (const [time, pressure] of visible) {
      if (!last || time > last.time) last = { time, pressure, name }
    }
  }
  if (last) {
    const d = new Date(last.time)
    const pad = n => ('0' + n).slice(-2)
    lines.push('Последний прочитанный · ' + last.name,
      pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + '  ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
      last.pressure.toFixed(1) + ' гПа / ' + (last.pressure * 100 / 133.322387415).toFixed(1) + ' мм рт. ст.')
  } else {
    lines.push('Видимых замеров нет')
  }
  return lines.join('\n')
}
