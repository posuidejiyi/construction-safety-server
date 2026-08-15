// MySQL 驱动（生产环境，微信云托管内置 MySQL）
// 启动时自动建表 + 播种默认账号，无需手工执行 SQL
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const config = require('../config')
const { genId, formatTime } = require('../utils/gen')

let pool = null
let recreateTimer = null

// 创建连接池（带 error 自愈：连接层抖动时自动重建，避免一直 500）
async function createPool() {
  const p = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  })
  p.on('error', (err) => {
    console.error('[MySQL] 连接池错误：', err.message)
    if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR'].includes(err.code)) {
      schedulePoolRecreate()
    }
  })
  return p
}

// 延迟重建连接池（5 秒后；已有重建任务则跳过，失败自动重试）
function schedulePoolRecreate() {
  if (recreateTimer) return
  recreateTimer = setTimeout(async () => {
    recreateTimer = null
    const old = pool
    try {
      const p = await createPool()
      await p.query('SELECT 1')
      pool = p
      if (old && old !== p) old.end().catch(() => {})
      console.log('[MySQL] 连接池已重建')
    } catch (e) {
      console.error('[MySQL] 重建连接池失败：', e.message)
      schedulePoolRecreate()
    }
  }, 5000)
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    id_card VARCHAR(32) NOT NULL,
    phone VARCHAR(16) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    role VARCHAR(16) NOT NULL,
    project_id VARCHAR(64) NOT NULL DEFAULT '',
    project_name VARCHAR(128) NOT NULL DEFAULT '',
    branch VARCHAR(64) NOT NULL DEFAULT '',
    register_time VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(32) PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    type_name VARCHAR(32) NOT NULL,
    project_id VARCHAR(64) NOT NULL DEFAULT '',
    project_name VARCHAR(128) NOT NULL DEFAULT '',
    branch VARCHAR(64) NOT NULL DEFAULT '',
    reporter VARCHAR(64) NOT NULL,
    reporter_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT '待审核',
    data JSON NOT NULL,
    create_time VARCHAR(32) NOT NULL,
    INDEX idx_reporter_id (reporter_id),
    INDEX idx_branch (branch),
    INDEX idx_type (type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS locations (
    id VARCHAR(32) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL DEFAULT '',
    project_name VARCHAR(128) NOT NULL DEFAULT '',
    branch VARCHAR(64) NOT NULL DEFAULT '',
    province VARCHAR(64) NOT NULL DEFAULT '',
    city VARCHAR(64) NOT NULL,
    district VARCHAR(64) NOT NULL,
    address VARCHAR(255) NOT NULL DEFAULT '',
    latitude DECIMAL(10,6) NULL,
    longitude DECIMAL(10,6) NULL,
    reporter VARCHAR(64) NOT NULL,
    reporter_id VARCHAR(32) NOT NULL,
    create_time VARCHAR(32) NOT NULL,
    INDEX idx_branch (branch)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
]

// 默认账号（与原小程序 initDefaultAccounts 一致）
function defaultAccounts() {
  const hash = bcrypt.hashSync('admin123', 10)
  const now = formatTime(new Date())
  return [
    { id: genId('U'), name: '公司管理员', idCard: '110000000000000001', phone: '13800000001', passwordHash: hash, role: 'company', projectId: '', projectName: '', branch: '', registerTime: now },
    { id: genId('U'), name: '南京公司', idCard: '110000000000000002', phone: '13800000002', passwordHash: hash, role: 'branch', projectId: '', projectName: '', branch: '南京公司', registerTime: now },
    { id: genId('U'), name: '项目部负责人', idCard: '110000000000000003', phone: '13800000003', passwordHash: hash, role: 'project', projectId: genId('P'), projectName: '1号示范项目', branch: '南京公司', registerTime: now }
  ]
}

// 将 MySQL 行记录（下划线命名）转换为代码中使用的驼峰命名对象
function mapUser(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    idCard: row.id_card,
    phone: row.phone,
    passwordHash: row.password_hash,
    role: row.role,
    projectId: row.project_id,
    projectName: row.project_name,
    branch: row.branch,
    registerTime: row.register_time
  }
}

function mapLocation(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    branch: row.branch,
    province: row.province || '',
    city: row.city,
    district: row.district,
    address: row.address || '',
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    reporter: row.reporter,
    reporterId: row.reporter_id,
    createTime: row.create_time
  }
}

function toReport(row) {
  if (!row) return null
  let data = row.data
  if (typeof data === 'string') { try { data = JSON.parse(data) } catch (e) { data = {} } }
  return { id: row.id, type: row.type, typeName: row.type_name, projectId: row.project_id, projectName: row.project_name, branch: row.branch, reporter: row.reporter, reporterId: row.reporter_id, status: row.status, createTime: row.create_time, ...(data || {}) }
}

async function init() {
  // 启动重试：云托管容器启动时 MySQL 实例可能短暂不可达，最多重试 5 次，避免启动即退出
  const maxAttempts = 5
  let lastErr = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 先连接实例（不指定库），确保目标数据库存在，避免“Unknown database”报错
      const bootstrap = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password
      })
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` DEFAULT CHARACTER SET utf8mb4`)
      await bootstrap.end()

      pool = await createPool()
      for (const sql of DDL) await pool.query(sql)
      // 表结构迁移：旧表缺少 province/address/latitude/longitude 列时补充（云托管 MySQL 已有存量表）
      await migrateLocationColumns()
      // 播种默认账号（仅当手机号不存在时）
      for (const u of defaultAccounts()) {
        await pool.query(
          `INSERT IGNORE INTO users (id, name, id_card, phone, password_hash, role, project_id, project_name, branch, register_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [u.id, u.name, u.idCard, u.phone, u.passwordHash, u.role, u.projectId, u.projectName, u.branch, u.registerTime]
        )
      }
      return
    } catch (e) {
      lastErr = e
      console.error(`[MySQL] 初始化失败（第 ${attempt}/${maxAttempts} 次）：`, e.message)
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 5000 * attempt))
    }
  }
  throw lastErr
}

// locations 表增量迁移：为存量表补充 province/address/latitude/longitude 列
async function migrateLocationColumns() {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'locations'`,
    [config.db.database]
  )
  const existing = new Set(cols.map(c => c.COLUMN_NAME))
  const adds = []
  if (!existing.has('province')) adds.push("ADD COLUMN province VARCHAR(64) NOT NULL DEFAULT '' AFTER branch")
  if (!existing.has('address')) adds.push("ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT '' AFTER district")
  if (!existing.has('latitude')) adds.push('ADD COLUMN latitude DECIMAL(10,6) NULL AFTER address')
  if (!existing.has('longitude')) adds.push('ADD COLUMN longitude DECIMAL(10,6) NULL AFTER latitude')
  if (adds.length) {
    await pool.query('ALTER TABLE locations ' + adds.join(', '))
    console.log('[MySQL] locations 表已迁移，新增列：', adds.join('; '))
  }
}

async function close() { if (pool) await pool.end() }

// 数据库探活（/health 使用）
async function ping() { await pool.query('SELECT 1') }

async function createUser(user) {
  await pool.query(
    `INSERT INTO users (id, name, id_card, phone, password_hash, role, project_id, project_name, branch, register_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.name, user.idCard, user.phone, user.passwordHash, user.role, user.projectId, user.projectName, user.branch, user.registerTime]
  )
  return user
}

async function findUserByPhone(phone) {
  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [phone])
  return mapUser(rows[0])
}

async function findUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
  return mapUser(rows[0])
}

async function listUsers() {
  const [rows] = await pool.query('SELECT * FROM users')
  return rows.map(mapUser)
}

async function updateUserPassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id])
}

async function createReport(report) {
  const { id, type, typeName, projectId, projectName, branch, reporter, reporterId, status, data, createTime } = report
  await pool.query(
    `INSERT INTO reports (id, type, type_name, project_id, project_name, branch, reporter, reporter_id, status, data, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, type, typeName, projectId, projectName, branch, reporter, reporterId, status, JSON.stringify(data || {}), createTime]
  )
  return report
}

async function listReports(filter = {}) {
  const conds = []
  const params = []
  if (filter.type) { conds.push('type = ?'); params.push(filter.type) }
  if (filter.reporterId) { conds.push('reporter_id = ?'); params.push(filter.reporterId) }
  if (filter.branch) { conds.push('branch = ?'); params.push(filter.branch) }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
  const [rows] = await pool.query(`SELECT * FROM reports ${where} ORDER BY create_time DESC, id DESC`, params)
  return rows.map(toReport)
}

async function updateReportStatus(id, status) {
  await pool.query('UPDATE reports SET status = ? WHERE id = ?', [status, id])
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ? LIMIT 1', [id])
  return rows[0] ? toReport(rows[0]) : null
}

async function findReportById(id) {
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ? LIMIT 1', [id])
  return rows[0] ? toReport(rows[0]) : null
}

async function deleteReport(id) {
  await pool.query('DELETE FROM reports WHERE id = ?', [id])
}

async function deleteReportsOlderThan(days) {
  const cutoff = formatTime(new Date(Date.now() - days * 24 * 3600 * 1000))
  const [result] = await pool.query('DELETE FROM reports WHERE create_time < ?', [cutoff])
  return result.affectedRows
}

async function createLocation(loc) {
  const { id, projectId, projectName, branch, province, city, district, address, latitude, longitude, reporter, reporterId, createTime } = loc
  await pool.query(
    `INSERT INTO locations (id, project_id, project_name, branch, province, city, district, address, latitude, longitude, reporter, reporter_id, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, projectName, branch, province || '', city, district, address || '', latitude, longitude, reporter, reporterId, createTime]
  )
  return loc
}

async function listLocations(filter = {}) {
  const conds = []
  const params = []
  if (filter.branch) { conds.push('branch = ?'); params.push(filter.branch) }
  if (filter.reporterId) { conds.push('reporter_id = ?'); params.push(filter.reporterId) }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
  const [rows] = await pool.query(`SELECT * FROM locations ${where} ORDER BY create_time DESC, id DESC`, params)
  return rows.map(mapLocation)
}

async function deleteLocationsOlderThan(days) {
  const cutoff = formatTime(new Date(Date.now() - days * 24 * 3600 * 1000))
  const [result] = await pool.query('DELETE FROM locations WHERE create_time < ?', [cutoff])
  return result.affectedRows
}

async function findLocationById(id) {
  const [rows] = await pool.query('SELECT * FROM locations WHERE id = ? LIMIT 1', [id])
  return rows[0] ? mapLocation(rows[0]) : null
}

async function deleteLocation(id) {
  await pool.query('DELETE FROM locations WHERE id = ?', [id])
}

module.exports = {
  init, close, ping, createUser, findUserByPhone, findUserById, listUsers, updateUserPassword,
  createReport, listReports, findReportById, updateReportStatus, deleteReport, deleteReportsOlderThan,
  createLocation, listLocations, findLocationById, deleteLocation, deleteLocationsOlderThan
}
