// 上报相关接口：创建 / 列表 / 汇总 / 上报状态 / 审核
const express = require('express')
const jwt = require('jsonwebtoken')
const XLSX = require('xlsx')
const db = require('../db')
const config = require('../config')
const { auth } = require('../middleware/auth')
const { genId, formatTime } = require('../utils/gen')
const { REPORT_TYPE_NAMES, ALL_REPORT_TYPES, ROLES } = require('../data/constants')
const { getSummary } = require('../services/summary')
const { getProjectReportStatus, getAllProjectReportStatus } = require('../services/reportStatus')

const router = express.Router()

// 导出 Excel（危险源等各类型上报）：
// 1) 带 Authorization 调用 → 返回 JSON { url }，前端复制链接到浏览器下载（微信内无法直接下载）
// 2) 链接带 ?download=1&token=xxx 直接访问 → 返回 xlsx 二进制
// 注：该路由必须注册在 router.use(auth) 之前，否则 query token 会被全局鉴权拦截
router.get('/export', async (req, res, next) => {
  try {
    // 手动鉴权：支持 Authorization 头或 query token（浏览器直接打开下载链接时没有头）
    const header = req.headers.authorization || ''
    const token = (header.startsWith('Bearer ') ? header.slice(7) : '') || req.query.token || ''
    let user = null
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret)
        user = await db.findUserById(payload.id)
      } catch (e) { /* 下方统一 401 */ }
    }
    if (!user) return res.status(401).json({ success: false, message: '未登录' })

    const type = req.query.type || 'hazardSource'
    if (!ALL_REPORT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: '导出类型不正确' })
    }

    const reports = await scopedReports(user, type)
    // 注意：listReports 会把 data 展开到顶层（items/subType/level/quantity 在顶层，无 data 字段）
    const rows = []
    reports.forEach((r, idx) => {
      const items = Array.isArray(r.items) && r.items.length > 0 ? r.items : [null]
      items.forEach(it => {
        const name = it && it.name ? it.name : ''
        const level = it && it.level ? it.level : (r.level || '')
        rows.push([
          idx + 1,
          r.projectName || '',
          r.branch || '',
          r.reporter || '',
          REPORT_TYPE_NAMES[r.type] || r.type || '',
          name || r.subType || r.content || '',
          level,
          it && it.quantity ? it.quantity : (r.quantity || ''),
          r.createTime || ''
        ])
      })
    })

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: '暂无上报数据可导出' })
    }

    const headerRow = ['序号', '项目名称', '分公司', '上报人', '上报类型', '内容', '风险等级', '数量', '上报时间']
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows])
    ws['!cols'] = [
      { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 20 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, REPORT_TYPE_NAMES[type] || '上报数据')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    const fileName = (REPORT_TYPE_NAMES[type] || '上报数据') + '_' + dateStr + '.xlsx'

    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(fileName) + '"')
      return res.send(buf)
    }

    // JSON 模式：返回下载链接（含 token，浏览器可直接打开）
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https'
    const base = proto + '://' + req.get('host')
    const url = base + '/api/reports/export?type=' + encodeURIComponent(type) + '&download=1&token=' + encodeURIComponent(token)
    res.json({ success: true, url })
  } catch (e) { next(e) }
})

router.use(auth)

// 把数据库里的上报记录还原成前端结构（data 里的字段展开到顶层）
function toClient(r) {
  const { data, ...rest } = r
  return { ...rest, ...(data || {}) }
}

// 根据角色返回可见范围内的上报
async function scopedReports(user, type) {
  const filter = { type }
  if (user.role === ROLES.PROJECT) filter.reporterId = user.id
  if (user.role === ROLES.BRANCH) filter.branch = user.branch
  return db.listReports(filter)
}

// 把定位记录还原成前端上报结构（type=projectLocation，与前端“我的上报”项目定位 tab 对应）
function locationToReport(loc) {
  const region = [loc.province, loc.city, loc.district].filter(Boolean).join('')
  return {
    id: loc.id,
    type: 'projectLocation',
    typeName: '项目定位',
    projectId: loc.projectId || '',
    projectName: loc.projectName || '',
    branch: loc.branch || '',
    reporter: loc.reporter || '',
    reporterId: loc.reporterId || '',
    status: '已审核', // 定位上报即生效，无需审核
    subType: region || (loc.city || '') + (loc.district || ''),
    content: region + (loc.address ? ' ' + loc.address : '') + (loc.latitude ? `（${loc.latitude}, ${loc.longitude}）` : ''),
    items: [],
    latitude: loc.latitude,
    longitude: loc.longitude,
    address: loc.address || '',
    createTime: loc.createTime
  }
}

// 根据角色返回可见范围内的定位（与 scopedReports 相同的范围规则）
async function scopedLocations(user) {
  const filter = {}
  if (user.role === ROLES.PROJECT) filter.reporterId = user.id
  if (user.role === ROLES.BRANCH) filter.branch = user.branch
  return db.listLocations(filter)
}

// 创建上报
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}
    const type = body.type
    if (!ALL_REPORT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: '上报类型不正确' })
    }

    // 类型相关字段原样存入 data（items/subType/level/content/quantity/category）
    const data = {}
    for (const key of ['items', 'subType', 'level', 'content', 'quantity', 'category']) {
      if (body[key] !== undefined) data[key] = body[key]
    }
    if (!data.subType && data.items && Array.isArray(data.items) && data.items.length > 0) {
      data.subType = data.items.map(i => i.name).join('、')
    }

    const report = {
      id: genId('R'),
      type,
      typeName: REPORT_TYPE_NAMES[type],
      projectId: req.user.projectId || '',
      projectName: req.user.projectName || '',
      branch: req.user.branch || '',
      reporter: req.user.name,
      reporterId: req.user.id,
      status: '待审核',
      data,
      createTime: formatTime(new Date())
    }
    await db.createReport(report)
    res.json({ success: true, report: toClient(report) })
  } catch (e) { next(e) }
})

// 上报列表（按角色自动限定范围；?type= 可按类型过滤）
// 说明：项目定位也作为上报的一种（type=projectLocation）展示在“我的上报”里，
// 数据来自 locations 表，合并返回；?type=projectLocation 时只返回定位记录
router.get('/', async (req, res, next) => {
  try {
    const type = req.query.type || undefined
    const reports = await scopedReports(req.user, type)
    let list = reports.map(toClient)

    // 定位合并：type 为空（全部）或为 projectLocation 时，把定位记录并入列表
    if (!type || type === 'projectLocation') {
      const locations = await scopedLocations(req.user)
      const locationReports = locations.map(locationToReport)
      if (type === 'projectLocation') {
        list = locationReports
      } else {
        list = list.concat(locationReports)
        list.sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)))
      }
    }

    res.json({ success: true, reports: list })
  } catch (e) { next(e) }
})

// 汇总统计（按角色范围）
router.get('/summary', async (req, res, next) => {
  try {
    const reports = await scopedReports(req.user)
    res.json({ success: true, summary: getSummary(reports) })
  } catch (e) { next(e) }
})

// 本周一 00:00 字符串（与 create_time 格式一致，用于“本周口径”过滤；周日晚 24 点后自动重置）
function weekStartStr() {
  const now = new Date()
  const day = now.getDay() // 0=周日 ... 6=周六
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  const pad = n => String(n).padStart(2, '0')
  return monday.getFullYear() + '-' + pad(monday.getMonth() + 1) + '-' + pad(monday.getDate()) + ' 00:00'
}

// 项目上报状态（分公司端看本分公司，公司端看全公司；项目端无此权限）
// 只统计本周一 00:00 之后的上报，周日晚 24 点自动重置为“未填报”
router.get('/status', async (req, res, next) => {
  try {
    const users = await db.listUsers()
    const projectUsers = users.filter(u => u.role === ROLES.PROJECT)
    const weekStart = weekStartStr()
    if (req.user.role === ROLES.BRANCH) {
      const branchUsers = projectUsers.filter(u => u.branch === req.user.branch)
      const reports = (await db.listReports({ branch: req.user.branch }))
        .filter(r => String(r.createTime || '') >= weekStart)
      return res.json({ success: true, status: getProjectReportStatus(branchUsers, reports) })
    }
    if (req.user.role === ROLES.COMPANY) {
      const reports = (await db.listReports({}))
        .filter(r => String(r.createTime || '') >= weekStart)
      return res.json({ success: true, status: getAllProjectReportStatus(projectUsers, reports) })
    }
    res.status(403).json({ success: false, message: '项目端无此权限' })
  } catch (e) { next(e) }
})

// 审核状态更新（分公司/公司端）
router.put('/:id/status', async (req, res, next) => {
  try {
    if (![ROLES.BRANCH, ROLES.COMPANY].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '无审核权限' })
    }
    const { status } = req.body || {}
    if (!['待审核', '已审核', '已驳回'].includes(status)) {
      return res.status(400).json({ success: false, message: '状态不正确' })
    }
    const report = await db.updateReportStatus(req.params.id, status)
    if (!report) return res.status(404).json({ success: false, message: '上报记录不存在' })
    res.json({ success: true, report: toClient(report) })
  } catch (e) { next(e) }
})

// 撤回上报/定位：普通上报仅本人+待审核；位置上报（locations 表）仅本人，即报即生效可直接撤销
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id
    // 1. 普通上报（reports 表）
    const report = await db.findReportById(id)
    if (report) {
      if (report.reporterId !== req.user.id) {
        return res.status(403).json({ success: false, message: '只能撤回自己的上报' })
      }
      if (report.status !== '待审核') {
        return res.status(400).json({ success: false, message: '仅待审核状态的上报可以撤回' })
      }
      await db.deleteReport(id)
      return res.json({ success: true, message: '撤回成功' })
    }
    // 2. 位置上报（locations 表，type=projectLocation）
    const location = await db.findLocationById(id)
    if (!location) return res.status(404).json({ success: false, message: '上报记录不存在' })
    if (location.reporterId !== req.user.id) {
      return res.status(403).json({ success: false, message: '只能撤回自己的上报' })
    }
    await db.deleteLocation(id)
    res.json({ success: true, message: '撤回成功' })
  } catch (e) { next(e) }
})

module.exports = router
