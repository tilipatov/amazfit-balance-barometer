import { BaseApp } from '@zeppos/zml/base-app'

const transport = BaseApp()
let connected = false

App({
  globalData: {
    requestDiagnostic(packet) {
      if (!connected) {
        transport.onCreate()
        connected = true
      }
      return transport.request(packet, { timeout: 8000 })
    },
  },
  onDestroy() {
    if (connected) {
      connected = false
      transport.onDestroy()
    }
  },
})
