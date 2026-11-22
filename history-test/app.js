import { BaseApp } from '@zeppos/zml/base-app'

const transport = BaseApp()
let connected = false

App({
  globalData: {
    sendReport(report) {
      if (!connected) {
        transport.onCreate()
        connected = true
      }
      return transport.request({ method: 'catalog-report', params: report }, { timeout: 10000 })
    },
  },
  onDestroy() {
    if (connected) {
      connected = false
      transport.onDestroy()
    }
  },
})
