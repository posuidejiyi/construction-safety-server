// 服务入口：初始化数据库 → 启动 HTTP 服务 → 数据保留期清理任务
const config = require('./config')
const db = require('./db')
const app = require('./app')

async function main() {
  await db.init()
  console.log(`[数据库] 已初始化（driver=${config.db.driver}）`)

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[服务] 建筑安全监控后端已启动: http://0.0.0.0:${config.port}`)
  })

  // 数据保留期清理（DATA_RETENTION_DAYS > 0 时启用，每 6 小时执行一次）
  if (config.dataRetentionDays > 0) {
    const cleanup = async () => {
      try {
        const r = await db.deleteReportsOlderThan(config.dataRetentionDays)
        const l = await db.deleteLocationsOlderThan(config.dataRetentionDays)
        if (r > 0 || l > 0) console.log(`[清理] 已清除 ${config.dataRetentionDays} 天前数据：上报 ${r} 条，定位 ${l} 条`)
      } catch (e) { console.error('[清理] 失败', e) }
    }
    cleanup()
    setInterval(cleanup, 6 * 3600 * 1000)
  }
}

main().catch(err => {
  console.error('[启动失败]', err)
  process.exit(1)
})

// 优雅退出
process.on('SIGTERM', async () => {
  await db.close()
  process.exit(0)
})
