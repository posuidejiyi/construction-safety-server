// 工具函数（与小程序端 utils/util.js 保持一致）
function genId(prefix = 'R') {
  return prefix + Date.now() + String(Math.floor(Math.random() * 1000)).padStart(3, '0')
}

// 格式化时间，输出 'YYYY-MM-DD HH:mm'（与小程序端 formatTime 一致）
function formatTime(date = new Date()) {
  if (!date) return ''
  if (typeof date === 'string' || typeof date === 'number') {
    date = new Date(date)
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function validatePhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone)
}

function validateIdCard(idCard) {
  return /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)
}

module.exports = { genId, formatTime, validatePhone, validateIdCard }
