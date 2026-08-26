// Express 应用装配
const express = require('express')
const config = require('./config')
const db = require('./db')

const app = express()
app.use(express.json())

// 健康检查（云托管探活用）：MySQL 模式下会顺带探活数据库，
// 数据库不可用时返回 503，云托管探活失败会自动重启容器，实现自愈
app.get('/health', async (req, res) => {
  try {
    if (config.db.driver === 'mysql') await db.ping()
    res.json({ status: 'ok', db: 'ok' })
  } catch (e) {
    console.error('[健康检查] 数据库不可用：', e.message)
    res.status(503).json({ status: 'degraded', db: 'error' })
  }
})

app.use('/api/auth', require('./routes/auth'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/locations', require('./routes/locations'))
app.use('/api/weather', require('./routes/weather'))
app.use('/api/reminder', require('./routes/reminder'))
app.use('/api/monthly-hazards', require('./routes/monthlyHazards'))

// 404
app.use((req, res) => res.status(404).json({ success: false, message: '接口不存在' }))

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[错误]', err)
  res.status(500).json({ success: false, message: '服务器内部错误' })
})

module.exports = app
