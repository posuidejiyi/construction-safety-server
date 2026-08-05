// Express 应用装配
const express = require('express')

const app = express()
app.use(express.json())

// 健康检查（云托管探活用）
app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', require('./routes/auth'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/locations', require('./routes/locations'))
app.use('/api/weather', require('./routes/weather'))
app.use('/api/reminder', require('./routes/reminder'))

// 404
app.use((req, res) => res.status(404).json({ success: false, message: '接口不存在' }))

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[错误]', err)
  res.status(500).json({ success: false, message: '服务器内部错误' })
})

module.exports = app
