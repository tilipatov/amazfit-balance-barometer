import * as ui from '@zos/ui'
import * as router from '@zos/router'
import * as share from '@zos/share-storage'
import { writeFileSync } from '@zos/fs'

function inspect(fs, path) {
  const stat = fs.statSync({ path })
  if (!stat) return { reason: 'Файл не виден' }
  if (!stat.isFile || stat.size < 4 || stat.size % 4 || stat.size > 65536)
    return { reason: 'Неожиданный размер ' + stat.size }
  const data = fs.readFileSync({ path })
  if (!(data instanceof ArrayBuffer) || data.byteLength !== stat.size)
    return { reason: 'Неполное чтение' }
  return { values: new Float32Array(data) }
}

function control() {
  try {
    const path = 'probe-control.txt'
    writeFileSync({ path, data: 'ok', options: { encoding: 'utf8' } })
    const own = new share.FileSystem(9284617)
    return own.readFileSync({ path, options: { encoding: 'utf8' } }) === 'ok' ? 'OK' : 'сбой чтения'
  } catch (e) { return String(e) }
}

function report() {
  const now = new Date()
  const lines = ['Проверка ' + [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => ('0'+n).slice(-2)).join(':'),
    'Контроль API: ' + control()]
  const id = router.SYSTEM_APP_ALTIMETER
  if (!Number.isInteger(id)) return lines.concat('ID барометра недоступен').join('\n')
  const paths = ['pressure.dat', 'baro_altim/pressure.dat']
  for (const path of paths) {
    try {
      const result = inspect(new share.FileSystem(id), path)
      if (!result.values) {
        lines.push(path + ': ' + result.reason)
        continue
      }
      const v = result.values
      lines.push(path, 'Позиций: ' + v.length, 'Последние значения, гПа*')
      lines.push(Array.from(v.slice(-6), n => n === 0 ? '—' : (n/100).toFixed(2)).join(' · '))
      lines.push('Время точек неизвестно')
      break
    } catch (e) { lines.push(path + ': ' + String(e)) }
  }
  return lines.join('\n')
}

Page({
  build() {
    const output = ui.createWidget(ui.widget.TEXT, {
      x: 65, y: 84, w: 350, h: 242, text_size: 20, color: 0xffffff,
      text_style: ui.text_style.WRAP, text: 'Тест штатной истории давления',
    })
    ui.createWidget(ui.widget.BUTTON, {
      x: 70, y: 332, w: 340, h: 58, radius: 24, text_size: 20,
      text: 'Проверить штатную историю', normal_color: 0x246587, press_color: 0x19475e,
      click_func: () => output.setProperty(ui.prop.TEXT, report()),
    })
  },
})
