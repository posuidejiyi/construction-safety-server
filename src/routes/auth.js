// 认证相关接口：注册 / 登录 / 重置密码 / 当前用户
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const config = require('../config')
const { auth, safeUser } = require('../middleware/auth')
const { genId, formatTime, validatePhone, validateIdCard } = require('../utils/gen')
const { ROLES, BRANCHES } = require('../data/constants')

const router = express.Router()

// 注册
router.post('/register', async (req, res, next) => {
  try {
    const { name, idCard, phone, password, role, branch, projectName } = req.body || {}

    if (!name || !String(name).trim()) return res.status(400).json({ success: false, message: '请输入真实姓名' })
    if (!validateIdCard(String(idCard || '').trim())) return res.status(400).json({ success: false, message: '请输入正确的身份证号' })
    if (!validatePhone(String(phone || '').trim())) return res.status(400).json({ success: false, message: '请输入正确的手机号' })
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: '密码至少6位' })
    if (![ROLES.PROJECT, ROLES.BRANCH, ROLES.COMPANY].includes(role)) return res.status(400).json({ success: false, message: '角色不正确' })
    if (role !== ROLES.COMPANY) {
      if (!branch) return res.status(400).json({ success: false, message: '请选择所属分公司' })
      if (role === ROLES.PROJECT && !String(projectName || '').trim()) return res.status(400).json({ success: false, message: '请输入项目名称' })
    }

    const phoneStr = String(phone).trim()
    const idCardStr = String(idCard).trim().toUpperCase()

    const existPhone = await db.findUserByPhone(phoneStr)
    if (existPhone) return res.status(400).json({ success: false, message: '该手机号已注册' })
    const existIdCard = (await db.listUsers()).find(u => u.idCard === idCardStr)
    if (existIdCard) return res.status(400).json({ success: false, message: '该身份证号已注册' })

    const user = {
      id: genId('U'),
      name: String(name).trim(),
      idCard: idCardStr,
      phone: phoneStr,
      passwordHash: bcrypt.hashSync(String(password), 10),
      role,
      projectId: role === ROLES.PROJECT ? genId('P') : '',
      projectName: role === ROLES.PROJECT ? String(projectName).trim() : '',
      branch: role === ROLES.COMPANY ? '' : branch,
      registerTime: formatTime(new Date())
    }
    await db.createUser(user)
    res.json({ success: true, message: '注册成功' })
  } catch (e) { next(e) }
})

// 登录
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body || {}
    if (!phone || !password) return res.status(400).json({ success: false, message: '请输入手机号和密码' })

    const user = await db.findUserByPhone(String(phone).trim())
    if (!user) return res.status(400).json({ success: false, message: '该手机号未注册' })
    if (!bcrypt.compareSync(String(password), user.passwordHash)) {
      return res.status(400).json({ success: false, message: '密码错误' })
    }

    const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
    res.json({ success: true, token, user: safeUser(user) })
  } catch (e) { next(e) }
})

// 重置密码（手机号 + 身份证验证）
router.post('/reset-password', async (req, res, next) => {
  try {
    const { phone, idCard, newPassword } = req.body || {}
    if (!validatePhone(String(phone || '').trim())) return res.status(400).json({ success: false, message: '请输入正确的手机号' })
    if (!validateIdCard(String(idCard || '').trim())) return res.status(400).json({ success: false, message: '请输入正确的18位身份证号' })
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ success: false, message: '密码至少需要6位' })

    const user = await db.findUserByPhone(String(phone).trim())
    if (!user) return res.status(400).json({ success: false, message: '该手机号未注册' })
    if (user.idCard !== String(idCard).trim().toUpperCase()) {
      return res.status(400).json({ success: false, message: '身份证号验证失败，请检查后重试' })
    }

    await db.updateUserPassword(user.id, bcrypt.hashSync(String(newPassword), 10))
    res.json({ success: true, message: '密码重置成功' })
  } catch (e) { next(e) }
})

// 当前登录用户信息
router.get('/me', auth, (req, res) => {
  res.json({ success: true, user: safeUser(req.user) })
})

module.exports = router
