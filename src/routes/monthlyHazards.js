// 月度危险源辨识：Excel 导入 / 列表 / 详情 / 删除 / 模板下载
// 数据存于 MySQL 的 monthly_hazards 表（data 列 JSON 保存整份清单行）
const express = require('express')
const multer = require('multer')
const XLSX = require('xlsx')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { genId, formatTime } = require('../utils/gen')
const { ROLES } = require('../data/constants')

const router = express.Router()
router.use(auth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
})

// 模板列：中文表头（兼容常见变体）→ 字段 key
const HEADERS = [
  { key: 'seq', names: ['序号'] },
  { key: 'branch', names: ['分公司'] },
  { key: 'project', names: ['项目'] },
  { key: 'area', names: ['施工区域'] },
  { key: 'riskPoint', names: ['风险点'] },
  { key: 'planTime', names: ['预计实施时间'] },
  { key: 'riskParam', names: ['风险参数'] },
  { key: 'hazardDesc', names: ['危险源描述'] },
  { key: 'riskLevel', names: ['风险等级'] },
  { key: 'accidentType', names: ['可能导致的事故类型'] },
  { key: 'controlMeasures', names: ['控制措施'] },
  { key: 'controlLevel', names: ['管控层级'] },
  { key: 'dutyDept', names: ['责任部门/责任人', '责任部门', '责任单位'] },
  { key: 'superviseDept', names: ['监督部门/监督人', '监督部门', '监督单位'] }
]

const RISK_LEVELS = ['重大风险', '较大风险', '一般风险', '低风险']

function normalize(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').replace(/[：:]/g, '')
}

// 解析 Excel 首张工作表：定位表头行 → 按列名映射 → 提取数据行
function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows || rows.length === 0) throw new Error('Excel 文件为空')

  // 在前 10 行内定位表头（要求至少命中 8 个标准列名）
  let headerRow = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map(normalize)
    const hits = HEADERS.filter(h => h.names.some(n => row.indexOf(n) >= 0)).length
    if (hits >= 8) { headerRow = i; break }
  }
  if (headerRow < 0) throw new Error('未识别到标准表头，请使用模板格式的 Excel 文件')

  const header = (rows[headerRow] || []).map(normalize)
  const colMap = {}
  HEADERS.forEach(h => {
    const idx = header.findIndex(c => h.names.some(n => c.indexOf(n) >= 0))
    if (idx >= 0) colMap[h.key] = idx
  })

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const item = {}
    let hasAny = false
    HEADERS.forEach(h => {
      const ci = colMap[h.key]
      if (ci === undefined) return
      const v = row[ci] == null ? '' : String(row[ci]).trim()
      item[h.key] = v
      if (v) hasAny = true
    })
    if (!hasAny) continue
    items.push(item)
  }
  if (items.length === 0) throw new Error('未解析到任何数据行，请先按模板填写数据后再导入')

  // 标题：表头不在第 1 行时（旧格式有合并标题行）取第 1 行；表头在第 1 行时留空，由文件名兜底
  const title = headerRow > 0 && rows[0] && rows[0][0] ? String(rows[0][0]).trim() : ''
  return { items, title }
}

// 从标题（如“安装公司9月份…清单”）或首行预计实施时间（如 2026.9.1-2026.9.30）提取月份
function extractMonth(title, items) {
  let m = String(title || '').match(/(\d{1,2})\s*月份?/)
  if (m) {
    const now = new Date()
    return `${now.getFullYear()}-${String(m[1]).padStart(2, '0')}`
  }
  const planTime = items.length > 0 ? String(items[0].planTime || '') : ''
  m = planTime.match(/(20\d{2})[.\-/年](\d{1,2})/)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function calcRiskStats(items) {
  const stats = {}
  RISK_LEVELS.forEach(lv => { stats[lv] = 0 })
  items.forEach(it => {
    const lv = String(it.riskLevel || '').trim()
    if (RISK_LEVELS.indexOf(lv) >= 0) stats[lv]++
  })
  return stats
}

// 角色数据范围（与上报一致）：项目端=本人导入，分公司端=本分公司，公司端=全部
async function scopedMonthlyHazards(user) {
  const filter = {}
  if (user.role === ROLES.PROJECT) filter.uploaderId = user.id
  if (user.role === ROLES.BRANCH) filter.branch = user.branch
  return db.listMonthlyHazards(filter)
}

// 生成与模板一致的 Excel：Sheet1 表头+空白行（同用户模板），Sheet2/3 附件参考表
const HAZARD_TEMPLATE_REF = require('../data/hazardTemplateRef.json')
function buildTemplateBuffer() {
  const header = HEADERS.map(h => h.names[0])
  const sheet1 = [header]
  for (let i = 0; i < 20; i++) sheet1.push(Array(header.length).fill(''))

  const wb = XLSX.utils.book_new()

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1)
  ws1['!cols'] = [
    { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
    { wch: 40 }, { wch: 10 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 24 }, { wch: 20 }
  ]
  XLSX.utils.book_append_sheet(wb, ws1, '危险源清单汇总表')

  const ws2 = XLSX.utils.aoa_to_sheet(HAZARD_TEMPLATE_REF['附件1 常见风险点分级表'] || [])
  ws2['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 6 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, '附件1 常见风险点分级表')

  const ws3 = XLSX.utils.aoa_to_sheet(HAZARD_TEMPLATE_REF['附件2分部分项工程、施工活动主要危险源参考'] || [])
  ws3['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws3, '附件2分部分项工程、施工活动主要危险源参考')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// 导入：multipart 上传 Excel，解析后整份存入 monthly_hazards 表
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '未接收到文件' })
    const ext = (req.file.originalname || '').toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      return res.status(400).json({ success: false, message: '仅支持 .xlsx / .xls 格式的 Excel 文件' })
    }
    let parsed
    try {
      parsed = parseWorkbook(req.file.buffer)
    } catch (e) {
      // 格式/内容问题返回 400 友好提示，不视为服务器错误
      return res.status(400).json({ success: false, message: e.message || '文件解析失败' })
    }
    const { items, title } = parsed
    if (items.length > 5000) {
      return res.status(400).json({ success: false, message: '单次导入不能超过 5000 行，当前 ' + items.length + ' 行' })
    }

    const hazard = {
      id: genId('MH'),
      title: title || req.file.originalname.replace(/\.(xlsx|xls)$/i, ''),
      month: extractMonth(title, items),
      fileName: req.file.originalname,
      rowCount: items.length,
      riskStats: calcRiskStats(items),
      projectId: req.user.projectId || '',
      projectName: req.user.projectName || '',
      branch: req.user.branch || '',
      uploader: req.user.name,
      uploaderId: req.user.id,
      data: items,
      createTime: formatTime(new Date())
    }
    await db.createMonthlyHazard(hazard)
    res.json({ success: true, id: hazard.id, count: items.length, hazard: { id: hazard.id, title: hazard.title, month: hazard.month, rowCount: hazard.rowCount, riskStats: hazard.riskStats, createTime: hazard.createTime } })
  } catch (e) { next(e) }
})

// 列表（按角色限定范围，不含明细行）
router.get('/', async (req, res, next) => {
  try {
    const list = await scopedMonthlyHazards(req.user)
    res.json({ success: true, list })
  } catch (e) { next(e) }
})

// 本月各项目月度危险源辨识上传状态（待办事项用；每月20日起生效）
router.get('/upload-status', async (req, res, next) => {
  try {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const month = now.getFullYear() + '-' + pad(now.getMonth() + 1)
    const inWindow = now.getDate() >= 20

    const users = await db.listUsers()
    const projectUsers = users.filter(u => u.role === ROLES.PROJECT)
    const hazards = await db.listMonthlyHazards({})
    // 已上传口径：存在月份 ≥ 当前月份的清单即视为已完成（提前上传下月清单也算完成）
    const uploadedBy = new Set(hazards.filter(h => String(h.month) >= month).map(h => h.uploaderId))

    // 项目端：只返回自己
    if (req.user.role === ROLES.PROJECT) {
      return res.json({
        success: true,
        month,
        inWindow,
        uploaded: uploadedBy.has(req.user.id)
      })
    }

    // 分公司端：本分公司项目
    if (req.user.role === ROLES.BRANCH) {
      const projects = projectUsers
        .filter(u => u.branch === req.user.branch)
        .map(u => ({
          userId: u.id,
          name: u.name,
          projectName: u.projectName,
          phone: u.phone,
          uploaded: uploadedBy.has(u.id)
        }))
      return res.json({ success: true, month, inWindow, projects })
    }

    // 公司端：全公司项目 + 按分公司聚合（前端按分公司分组排序）
    const projects = projectUsers.map(u => ({
      userId: u.id,
      name: u.name,
      projectName: u.projectName,
      branch: u.branch || '',
      phone: u.phone,
      uploaded: uploadedBy.has(u.id)
    }))
    res.json({ success: true, month, inWindow, projects })
  } catch (e) { next(e) }
})

// 全部导出：分公司=本分公司所有项目填报的危险源辨识合并；公司端=全公司合并（按模板格式）
router.get('/export', async (req, res, next) => {
  try {
    const list = await scopedMonthlyHazards(req.user)
    const rows = []
    // 列表接口不含 data 字段，导出时按 id 取全量
    for (const h of list) {
      const full = await db.findMonthlyHazardById(h.id)
      ;(full && full.data || []).forEach(r => {
        rows.push([
          r.seq || '', r.branch || '', r.project || '', r.area || '', r.riskPoint || '',
          r.planTime || '', r.riskParam || '', r.hazardDesc || '', r.riskLevel || '',
          r.accidentType || '', r.controlMeasures || '', r.controlLevel || '',
          r.dutyDept || '', r.superviseDept || ''
        ])
      })
    }
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: '暂无已导入的危险源数据可导出' })
    }

    const header = HEADERS.map(h => h.names[0])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
      { wch: 40 }, { wch: 10 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 24 }, { wch: 20 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, '危险源清单汇总表')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const fileName = '危险源辨识汇总_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.xlsx'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(fileName) + '"')
    res.send(buf)
  } catch (e) { next(e) }
})

// 下载导入模板（与导入格式一致）
router.get('/template', (req, res, next) => {
  try {
    const buf = buildTemplateBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="monthly-hazard-template.xlsx"')
    res.send(buf)
  } catch (e) { next(e) }
})

// 详情（含全部明细行）
router.get('/:id', async (req, res, next) => {
  try {
    const hazard = await db.findMonthlyHazardById(req.params.id)
    if (!hazard) return res.status(404).json({ success: false, message: '记录不存在' })
    // 角色范围校验
    if (req.user.role === ROLES.PROJECT && hazard.uploaderId !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权查看该记录' })
    }
    if (req.user.role === ROLES.BRANCH && hazard.branch !== req.user.branch) {
      return res.status(403).json({ success: false, message: '无权查看该记录' })
    }
    res.json({ success: true, hazard })
  } catch (e) { next(e) }
})

// 删除：上传者本人，或分公司/公司端管理员（同范围）
router.delete('/:id', async (req, res, next) => {
  try {
    const hazard = await db.findMonthlyHazardById(req.params.id)
    if (!hazard) return res.status(404).json({ success: false, message: '记录不存在' })
    const isOwner = hazard.uploaderId === req.user.id
    const isBranchAdmin = req.user.role === ROLES.BRANCH && hazard.branch === req.user.branch
    const isCompanyAdmin = req.user.role === ROLES.COMPANY
    if (!isOwner && !isBranchAdmin && !isCompanyAdmin) {
      return res.status(403).json({ success: false, message: '无权删除该记录' })
    }
    await db.deleteMonthlyHazard(req.params.id)
    res.json({ success: true, message: '删除成功' })
  } catch (e) { next(e) }
})

module.exports = router
