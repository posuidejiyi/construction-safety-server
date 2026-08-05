// 项目定位接口
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { genId, formatTime } = require('../utils/gen')
const { ROLES } = require('../data/constants')

const router = express.Router()
router.use(auth)

// 上报项目定位
router.post('/', async (req, res, next) => {
  try {
    const { city, district } = req.body || {}
    if (!city) return res.status(400).json({ success: false, message: '请选择所在城市' })
    if (!district) return res.status(400).json({ success: false, message: '请选择所在地区' })

    const location = {
      id: genId('PL'),
      projectId: req.user.projectId || '',
      projectName: req.user.projectName || '',
      branch: req.user.branch || '',
      city,
      district,
      reporter: req.user.name,
      reporterId: req.user.id,
      createTime: formatTime(new Date())
    }
    await db.createLocation(location)
    res.json({ success: true, location })
  } catch (e) { next(e) }
})

// 定位列表（按角色范围）
router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.user.role === ROLES.PROJECT) filter.reporterId = req.user.id
    if (req.user.role === ROLES.BRANCH) filter.branch = req.user.branch
    const locations = await db.listLocations(filter)
    res.json({ success: true, locations })
  } catch (e) { next(e) }
})

module.exports = router
