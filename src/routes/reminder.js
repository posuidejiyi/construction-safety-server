// 周一上报提醒接口
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { checkMondayReportReminder } = require('../services/reminder')
const { ROLES } = require('../data/constants')

const router = express.Router()
router.use(auth)

router.get('/monday', async (req, res, next) => {
  try {
    const users = await db.listUsers()
    const projectUsers = users.filter(u => u.role === ROLES.PROJECT)
    let reports = await db.listReports({})
    if (req.user.role === ROLES.PROJECT) reports = reports.filter(r => r.reporterId === req.user.id)
    if (req.user.role === ROLES.BRANCH) reports = reports.filter(r => r.branch === req.user.branch)
    const reminder = checkMondayReportReminder(req.user, projectUsers, reports)
    res.json({ success: true, reminder })
  } catch (e) { next(e) }
})

module.exports = router
