import * as ui from '@zos/ui'
import { SYSTEM_APP_ALTIMETER } from '@zos/router'
import { FileSystem } from '@zos/share-storage'
import { scanCatalog } from '../lib/catalog.js'

Page({
  build() {
    this.active = true
    const output = ui.createWidget(ui.widget.TEXT, {
      x: 62, y: 85, w: 356, h: 210, text_size: 22, color: 0xffffff,
      text_style: ui.text_style.WRAP, text: 'Читаю каталог штатного барометра…',
    })
    const status = value => {
      if (this.active) output.setProperty(ui.prop.TEXT, value)
    }
    this.load(status)
    ui.createWidget(ui.widget.BUTTON, {
      x: 87, y: 322, w: 306, h: 56, radius: 26, text_size: 21,
      text: 'Отправить в Zepp', normal_color: 0x246587, press_color: 0x19475e,
      click_func: async () => {
        if (!this.snapshot || this.sending) return
        this.sending = true
        status(this.snapshot.summary + '\nПередача…')
        try {
          const reply = await getApp()._options.globalData.sendReport(this.snapshot)
          if (!reply || reply.savedAt !== this.snapshot.time) throw new Error('нет подтверждения от телефона')
          status(this.snapshot.summary + '\nОтчёт сохранён в Zepp.')
        } catch (error) {
          status('Передача не удалась. Можно повторить.\n' + String(error))
        } finally {
          this.sending = false
        }
      },
    })
  },
  async load(status) {
    this.snapshot = null
    let result
    try {
      if (!Number.isInteger(SYSTEM_APP_ALTIMETER)) throw new Error('ID барометра недоступен')
      result = await scanCatalog(new FileSystem(SYSTEM_APP_ALTIMETER), () => new Promise(resolve => setTimeout(resolve, 20)))
    } catch (error) {
      result = { summary: 'Не удалось открыть хранилище барометра.', lines: [String(error).slice(0, 160)] }
    }
    if (!this.active) return
    this.snapshot = { time: Date.now(), summary: result.summary, lines: result.lines }
    status(result.summary + '\nПодробности можно передать на телефон.')
  },
  onDestroy() { this.active = false },
})
