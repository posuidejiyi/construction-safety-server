// 账号安全：个人信息变更申请（分公司审核）/ 账号注销申请（分公司审核）
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')
const { genId, formatTime, validatePhone } = require('../utils/gen')
const { ROLES } = require('../data/constants')

const router = express.Router()
router.use(auth)

// 是否有待审核的申请（同类型）
async function hasPending(userId, type) {
  const list = await db.listChangeRequests({ userId, type, status: 'pending' })
  return list.length > 0
}

// 提交个人信息变更申请（仅项目端）：手机号/项目名称可变更，需填写修改理由
router.post('/change-request', async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.PROJECT) {
      return res.status(403).json({ success: false, message: '仅项目端可提交信息变更申请' })
    }
    const body = req.body || {}
    const phone = body.phone !== undefined ? String(body.phone).trim() : undefined
    const projectName = body.projectName !== undefined ? String(body.projectName).trim() : undefined
    const reason = String(body.reason || '').trim()
    if (!phone && !projectName) return res.status(400).json({ success: false, message: '请填写要变更的内容' })
    if (phone !== undefined && !validatePhone(phone)) return res.status(400).json({ success: false, message: '手机号格式不正确' })
    if (!reason) return res.status(400).json({ success: false, message: '请填写修改理由' })

    // 手机号不能与其他人重复
    if (phone !== undefined && phone !== req.user.phone) {
      const users = await db.listUsers()
      if (users.some(u => u.id !== req.user.id && u.phone === phone)) {
        return res.status(400).json({ success: false, message: '该手机号已被其他账号使用' })
      }
    }

    if (await hasPending(req.user.id, 'profile')) {
      return res.status(400).json({ success: false, message: '已有待审核的信息变更申请，请等待审核' })
    }

    const requestData = {}
    if (phone !== undefined && phone !== req.user.phone) requestData.phone = phone
    if (projectName !== undefined && projectName !== req.user.projectName) requestData.projectName = projectName
    if (Object.keys(requestData).length === 0) {
      return res.status(400).json({ success: false, message: '变更内容与当前信息一致，无需修改' })
    }
    requestData.reason = reason

    const reqRecord = {
      id: genId('CR'),
      userId: req.user.id,
      userName: req.user.name,
      projectName: req.user.projectName || '',
      branch: req.user.branch || '',
      type: 'profile',
      requestData,
      status: 'pending',
      approver: '',
      createTime: formatTime(new Date()),
      handleTime: ''
    }
    await db.createChangeRequest(reqRecord)
    res.json({ success: true, request: reqRecord, message: '变更申请已提交，等待分公司审核' })
  } catch (e) { next(e) }
})

// 提交账号注销申请（仅项目端），需填写注销理由
router.post('/cancel-request', async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.PROJECT) {
      return res.status(403).json({ success: false, message: '仅项目端可发起账号注销' })
    }
    const reason = String((req.body || {}).reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, message: '请填写注销理由' })
    if (await hasPending(req.user.id, 'cancel')) {
      return res.status(400).json({ success: false, message: '已有待审核的注销申请，请等待审核' })
    }

    const reqRecord = {
      id: genId('CR'),
      userId: req.user.id,
      userName: req.user.name,
      projectName: req.user.projectName || '',
      branch: req.user.branch || '',
      type: 'cancel',
      requestData: { reason },
      status: 'pending',
      approver: '',
      createTime: formatTime(new Date()),
      handleTime: ''
    }
    await db.createChangeRequest(reqRecord)
    res.json({ success: true, request: reqRecord, message: '注销申请已提交，等待分公司审核' })
  } catch (e) { next(e) }
})

// 申请列表（按角色限定范围）
// 项目端：自己的申请；分公司端：本分公司的全部申请（profile 变更 + cancel 注销）；公司端：不再返回（审核已下放到分公司）
router.get('/requests', async (req, res, next) => {
  try {
    let list = []
    if (req.user.role === ROLES.PROJECT) {
      list = await db.listChangeRequests({ userId: req.user.id })
    } else if (req.user.role === ROLES.BRANCH) {
      // 分公司端：本分公司的全部申请（信息变更 profile + 账号注销 cancel）
      list = await db.listChangeRequests({ branch: req.user.branch })
    }
    res.json({ success: true, list })
  } catch (e) { next(e) }
})

// 审核通过：profile 变更、cancel 注销均由分公司审核（注销审核已从公司端移到分公司端）
router.put('/requests/:id/approve', async (req, res, next) => {
  try {
    const reqRecord = await db.findChangeRequestById(req.params.id)
    if (!reqRecord) return res.status(404).json({ success: false, message: '申请不存在' })
    if (reqRecord.status !== 'pending') return res.status(400).json({ success: false, message: '该申请已处理' })

    if (reqRecord.type === 'profile') {
      if (req.user.role !== ROLES.BRANCH || reqRecord.branch !== req.user.branch) {
        return res.status(403).json({ success: false, message: '仅本分公司可审核该变更申请' })
      }
      // 应用变更到用户表
      const user = await db.findUserById(reqRecord.userId)
      if (!user) return res.status(404).json({ success: false, message: '申请用户不存在' })
      const patch = {}
      if (reqRecord.requestData.phone) {
        const users = await db.listUsers()
        if (users.some(u => u.id !== reqRecord.userId && u.phone === reqRecord.requestData.phone)) {
          return res.status(400).json({ success: false, message: '新手机号已被其他账号使用，无法通过' })
        }
        patch.phone = reqRecord.requestData.phone
      }
      if (reqRecord.requestData.projectName) patch.projectName = reqRecord.requestData.projectName
      await db.updateUserProfile(reqRecord.userId, patch)
      await db.updateChangeRequestStatus(reqRecord.id, 'approved', req.user.name)
      return res.json({ success: true, message: '已同意变更，用户信息已更新' })
    }

    // cancel：仅本分公司可审核（注销审核已从公司端移到分公司端）
    if (req.user.role !== ROLES.BRANCH || reqRecord.branch !== req.user.branch) {
      return res.status(403).json({ success: false, message: '仅本分公司可审核该注销申请' })
    }
    await db.deleteUserDataAndUser(reqRecord.userId)
    await db.updateChangeRequestStatus(reqRecord.id, 'approved', req.user.name)
    res.json({ success: true, message: '已同意注销，用户填报信息已清空、注册资料已删除' })
  } catch (e) { next(e) }
})

// 审核驳回：同角色权限规则
router.put('/requests/:id/reject', async (req, res, next) => {
  try {
    const reqRecord = await db.findChangeRequestById(req.params.id)
    if (!reqRecord) return res.status(404).json({ success: false, message: '申请不存在' })
    if (reqRecord.status !== 'pending') return res.status(400).json({ success: false, message: '该申请已处理' })

    if (reqRecord.type === 'profile') {
      if (req.user.role !== ROLES.BRANCH || reqRecord.branch !== req.user.branch) {
        return res.status(403).json({ success: false, message: '仅本分公司可审核该变更申请' })
      }
    } else if (req.user.role !== ROLES.BRANCH || reqRecord.branch !== req.user.branch) {
      return res.status(403).json({ success: false, message: '仅本分公司可审核该注销申请' })
    }
    await db.updateChangeRequestStatus(reqRecord.id, 'rejected', req.user.name)
    res.json({ success: true, message: '已驳回申请' })
  } catch (e) { next(e) }
})

module.exports = router
