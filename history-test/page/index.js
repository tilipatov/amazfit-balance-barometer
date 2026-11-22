import { journalReport } from '../lib/barometer-journal.js'
import * as ui from '@zos/ui'
import * as router from '@zos/router'
import * as share from '@zos/share-storage'
import { writeFileSync } from '@zos/fs'

function inspect(fs, path) {
  if (typeof fs.readFileSync !== 'function') return { reason: 'readFileSync отсутствует' }
  let data
  try {
    data = fs.readFileSync({ path })
  } catch (error) {
    return { reason: 'readFileSync: ' + String(error) }
  }
  if (data == null) return { reason: 'readFileSync: нет данных' }
  if (!(data instanceof ArrayBuffer)) return { reason: 'readFileSync: тип ' + typeof data }
  if (data.byteLength < 4 || data.byteLength % 4 || data.byteLength > 65536)
    return { reason: 'Размер: ' + data.byteLength + ' байт' }
  return { values: new Float32Array(data) }
}

function control() {
  try {
    const path = 'probe-control.bin'
    writeFileSync({ path, data: new Float32Array([100000]).buffer })
    const own = new share.FileSystem(9284617)
    const check = inspect(own, path)
    if (check.reason) return check.reason
    return check.values.length === 1 && check.values[0] === 100000 ? 'OK' : 'значение не совпало'
  } catch (e) { return 'подготовка: ' + String(e) }
}

function report() {
  const now = new Date()
  const lines = ['Тест 4 · ' + [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => ('0'+n).slice(-2)).join(':'),
    'Контроль Float32: ' + control()]
  const id = router.SYSTEM_APP_ALTIMETER
  if (!Number.isInteger(id)) return lines.concat('ID барометра недоступен').join('\n')
  let fs
  try { fs = new share.FileSystem(id) }
  catch (e) { return lines.concat('FileSystem: ' + String(e)).join('\n') }
  lines.push('statSync: ' + typeof fs.statSync)
  const paths = ['pressure.dat', 'baro_altim/pressure.dat']
  for (const path of paths) {
    try {
      const result = inspect(fs, path)
      if (!result.values) {
        lines.push(path + ': ' + result.reason)
        continue
      }
      const v = result.values
      lines.push(path, 'Позиций: ' + v.length, 'Последние значения, гПа*')
      const tail = []
      for (let i = Math.max(0, v.length - 6); i < v.length; i++)
        tail.push(v[i] === 0 ? '—' : (v[i] / 100).toFixed(2))
      lines.push(tail.join(' · '))
      lines.push('Время точек неизвестно')
      break
    } catch (e) { lines.push(path + ' · обработка: ' + String(e)) }
  }
  return lines.join('\n')
}

Page({
  build() {
    const output = ui.createWidget(ui.widget.TEXT, {
      x: 65, y: 74, w: 350, h: 204, text_size: 17, color: 0xffffff,
      text_style: ui.text_style.WRAP, text: 'Тест 4 · выберите журнал',
    })
    ui.createWidget(ui.widget.BUTTON, {
      x: 70, y: 285, w: 340, h: 45, radius: 24, text_size: 20,
      text: 'Журнал Барометра+', normal_color: 0x246587, press_color: 0x19475e,
      click_func: () => {
        try {
          const fs = new share.FileSystem(1137488)
          output.setProperty(ui.prop.TEXT, journalReport(fs, Date.now()))
        } catch (error) {
          output.setProperty(ui.prop.TEXT, 'Барометр+ · ' + String(error))
        }
      },
    })
    ui.createWidget(ui.widget.BUTTON, {
      x: 90, y: 337, w: 300, h: 43, radius: 24, text_size: 20,
      text: 'Проверить штатную историю', normal_color: 0x246587, press_color: 0x19475e,
      click_func: () => output.setProperty(ui.prop.TEXT, report()),
    })
    ui.createWidget(ui.widget.BUTTON, {
      x: 107, y: 387, w: 266, h: 42, radius: 21, text_size: 19,
      text: 'Каталог барометра', normal_color: 0x246587, press_color: 0x19475e,
      click_func: () => router.push({ url: 'page/catalog' }),
    })
  },
})
