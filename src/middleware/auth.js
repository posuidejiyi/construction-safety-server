// JWT 登录鉴权中间件
const jwt = require('jsonwebtoken')
const config = require('../config')
const db = require('../db')

// 身份证脱敏：保留前6位+后4位，中间出生日期8位用星号（15位老证保留前6+后1）
function maskIdCard(idCard) {
  const s = String(idCard || '')
  if (s.length >= 18) return s.slice(0, 6) + '********' + s.slice(-4)
  if (s.length === 15) return s.slice(0, 6) + '********' + s.slice(-1)
  return s
}

// 去掉敏感字段（密码哈希）后返回给前端；身份证仅返回脱敏值
function safeUser(u) {
  if (!u) return null
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    idCardMasked: maskIdCard(u.idCard),
    role: u.role,
    projectId: u.projectId || '',
    projectName: u.projectName || '',
    branch: u.branch || ''
  }
}

async function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ success: false, message: '未登录' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const user = await db.findUserById(payload.id)
    if (!user) return res.status(401).json({ success: false, message: '用户不存在' })
    req.user = user
    next()
  } catch (e) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' })
  }
}

module.exports = { auth, safeUser }
