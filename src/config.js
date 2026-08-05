// 环境变量配置（所有配置均可通过环境变量覆盖，云托管控制台里设置）
require('dotenv').config()

const config = {
  // 生产环境（Dockerfile 已设 NODE_ENV=production）默认 80，对应云托管容器端口；本地开发默认 3000
  port: parseInt(process.env.PORT || (process.env.NODE_ENV === 'production' ? '80' : '3000'), 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-please-change',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  db: {
    // driver: mysql（生产，云托管内置MySQL） / memory（本地开发演示，重启丢数据）
    driver: process.env.DB_DRIVER || (process.env.DB_HOST ? 'mysql' : 'memory'),
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'construction_safety'
  },
  // 数据保留天数：>0 时每天自动清理 N 天前的上报/定位数据（原小程序是每 7 天清空一次，设为 7 可复刻）
  // 0 = 永久保留（推荐生产使用，历史数据是资产，清空需谨慎）
  dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '0', 10)
}

module.exports = config
