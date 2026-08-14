// 上报相关接口：创建 / 列表 / 汇总 / 上报状态 / 审核
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { genId, formatTime } = require('../utils/gen')
const { REPORT_TYPE_NAMES, ALL_REPORT_TYPES, ROLES } = require('../data/constants')
const { getSummary } = require('../services/summary')
const { getProjectReportStatus, getAllProjectReportStatus } = require('../services/reportStatus')

const router = express.Router()
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

// 项目上报状态（分公司端看本分公司，公司端看全公司；项目端无此权限）
router.get('/status', async (req, res, next) => {
  try {
    const users = await db.listUsers()
    const projectUsers = users.filter(u => u.role === ROLES.PROJECT)
    if (req.user.role === ROLES.BRANCH) {
      const branchUsers = projectUsers.filter(u => u.branch === req.user.branch)
      const reports = await db.listReports({ branch: req.user.branch })
      return res.json({ success: true, status: getProjectReportStatus(branchUsers, reports) })
    }
    if (req.user.role === ROLES.COMPANY) {
      const reports = await db.listReports({})
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

// 撤回上报（仅上报人本人可撤回，且仅限待审核状态）
router.delete('/:id', async (req, res, next) => {
  try {
    const report = await db.findReportById(req.params.id)
    if (!report) return res.status(404).json({ success: false, message: '上报记录不存在' })
    if (report.reporterId !== req.user.id) {
      return res.status(403).json({ success: false, message: '只能撤回自己的上报' })
    }
    if (report.status !== '待审核') {
      return res.status(400).json({ success: false, message: '仅待审核状态的上报可以撤回' })
    }
    await db.deleteReport(req.params.id)
    res.json({ success: true, message: '撤回成功' })
  } catch (e) { next(e) }
})

module.exports = router
