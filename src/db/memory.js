// 内存驱动（本地开发/演示用，重启后数据丢失）
// 与 mysql.js 保持相同的方法签名，方便切换
const bcrypt = require('bcryptjs')
const { genId, formatTime } = require('../utils/gen')

const state = { users: [], reports: [], locations: [] }

function defaultAccounts() {
  const hash = bcrypt.hashSync('admin123', 10)
  const now = formatTime(new Date())
  return [
    { id: genId('U'), name: '公司管理员', idCard: '110000000000000001', phone: '13800000001', passwordHash: hash, role: 'company', projectId: '', projectName: '', branch: '', registerTime: now },
    { id: genId('U'), name: '南京公司', idCard: '110000000000000002', phone: '13800000002', passwordHash: hash, role: 'branch', projectId: '', projectName: '', branch: '南京公司', registerTime: now },
    { id: genId('U'), name: '项目部负责人', idCard: '110000000000000003', phone: '13800000003', passwordHash: hash, role: 'project', projectId: genId('P'), projectName: '1号示范项目', branch: '南京公司', registerTime: now }
  ]
}

async function init() {
  for (const u of defaultAccounts()) {
    if (!state.users.some(x => x.phone === u.phone)) state.users.push(u)
  }
}
async function close() {}

async function createUser(user) { state.users.push(user); return user }
async function findUserByPhone(phone) { return state.users.find(u => u.phone === phone) || null }
async function findUserById(id) { return state.users.find(u => u.id === id) || null }
async function listUsers() { return state.users.slice() }
async function updateUserPassword(id, passwordHash) {
  const u = state.users.find(x => x.id === id)
  if (u) u.passwordHash = passwordHash
}

async function createReport(report) { state.reports.unshift(report); return report }

// 与 mysql 驱动一致：把 data 里的字段展开到顶层，方便业务层直接读取
function toReport(r) {
  const { data, ...rest } = r
  return { ...rest, ...(data || {}) }
}

async function listReports(filter = {}) {
  return state.reports
    .filter(r => (!filter.type || r.type === filter.type) &&
                 (!filter.reporterId || r.reporterId === filter.reporterId) &&
                 (!filter.branch || r.branch === filter.branch))
    .map(toReport)
    .sort((a, b) => b.createTime.localeCompare(a.createTime))
}
async function updateReportStatus(id, status) {
  const r = state.reports.find(x => x.id === id)
  if (!r) return null
  r.status = status
  return toReport(r)
}
async function findReportById(id) {
  const r = state.reports.find(x => x.id === id)
  return r ? toReport(r) : null
}
async function deleteReport(id) {
  state.reports = state.reports.filter(x => x.id !== id)
}
async function deleteReportsOlderThan(days) {
  const cutoff = formatTime(new Date(Date.now() - days * 24 * 3600 * 1000))
  const before = state.reports.length
  state.reports = state.reports.filter(r => r.createTime >= cutoff)
  return before - state.reports.length
}

async function createLocation(loc) { state.locations.unshift(loc); return loc }
async function listLocations(filter = {}) {
  return state.locations
    .filter(l => (!filter.branch || l.branch === filter.branch) &&
                 (!filter.reporterId || l.reporterId === filter.reporterId))
    .slice()
    .sort((a, b) => b.createTime.localeCompare(a.createTime))
}
async function deleteLocationsOlderThan(days) {
  const cutoff = formatTime(new Date(Date.now() - days * 24 * 3600 * 1000))
  const before = state.locations.length
  state.locations = state.locations.filter(l => l.createTime >= cutoff)
  return before - state.locations.length
}

async function findLocationById(id) {
  return state.locations.find(l => l.id === id) || null
}

async function deleteLocation(id) {
  state.locations = state.locations.filter(l => l.id !== id)
}

module.exports = {
  init, close, createUser, findUserByPhone, findUserById, listUsers, updateUserPassword,
  createReport, listReports, findReportById, updateReportStatus, deleteReport, deleteReportsOlderThan,
  createLocation, listLocations, findLocationById, deleteLocation, deleteLocationsOlderThan
}
