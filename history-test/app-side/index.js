import { BaseSideService } from '@zeppos/zml/base-side'

AppSideService(BaseSideService({
  onRequest({ method, params }, reply) {
    if (method !== 'catalog-report' || !params || !Number.isSafeInteger(params.time) ||
      typeof params.summary !== 'string' || !Array.isArray(params.lines) ||
      !params.lines.every(line => typeof line === 'string')) return reply('Некорректный отчёт')
    try {
      const report = JSON.stringify(params)
      this.settings.setItem('catalog-report', report)
      if (this.settings.getItem('catalog-report') !== report) return reply('Ошибка сохранения')
      reply(null, { savedAt: params.time })
    } catch (error) { reply(String(error)) }
  },
}))
