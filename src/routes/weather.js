// 气象预警接口（基于已上报的项目定位生成 Mock 预警）
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { genWeatherWarning } = require('../services/weather')
const { ROLES } = require('../data/constants')

const router = express.Router()
router.use(auth)

router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.user.role === ROLES.PROJECT) filter.reporterId = req.user.id
    if (req.user.role === ROLES.BRANCH) filter.branch = req.user.branch
    const locations = await db.listLocations(filter)
    const warnings = locations.map(l => genWeatherWarning(l.city, l.district))
    res.json({ success: true, warnings })
  } catch (e) { next(e) }
})

module.exports = router
