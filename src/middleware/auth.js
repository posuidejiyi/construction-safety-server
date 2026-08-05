// JWT 登录鉴权中间件
const jwt = require('jsonwebtoken')
const config = require('../config')
const db = require('../db')

// 去掉敏感字段（身份证、密码哈希）后返回给前端
function safeUser(u) {
  if (!u) return null
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
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
