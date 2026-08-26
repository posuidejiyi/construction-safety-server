// utils/api.js —— 对接后端服务的请求封装
// 已配置为你的云托管服务域名；登录成功后自动保存登录态，其余接口自动携带 token。
// 401 时自动清除登录态并跳回登录页。
const BASE_URL = 'https://zjbjszjs.cn'

const TOKEN_KEY = 'cs_token'
const USER_KEY = 'cs_current_user'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': getToken() ? 'Bearer ' + getToken() : ''
      },
      success(res) {
        if (res.statusCode === 401) {
          // 登录过期：清除本地登录态，回到登录页
          clearSession()
          wx.reLaunch({ url: '/pages/login/index' })
          reject(res.data)
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(res.data)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络请求失败', icon: 'none' })
        reject(err)
      }
    })
  })
}

// ===== 登录态管理 =====
function saveSession(user, token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token)
  if (user) wx.setStorageSync(USER_KEY, user)
}
function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}
function getSession() {
  return wx.getStorageSync(USER_KEY) || null
}
function setSessionUser(user) {
  if (user) wx.setStorageSync(USER_KEY, user)
}

module.exports = {
  BASE_URL,
  TOKEN_KEY,
  USER_KEY,
  saveSession,
  clearSession,
  getSession,
  setSessionUser,

  // ===== 认证 =====
  register(data) { return request('POST', '/api/auth/register', data) },
  login(phone, password) { return request('POST', '/api/auth/login', { phone, password }) },
  resetPassword(phone, idCard, newPassword) {
    return request('POST', '/api/auth/reset-password', { phone, idCard, newPassword })
  },
  checkPhone(phone) { return request('POST', '/api/auth/check-phone', { phone }) },
  getMe() { return request('GET', '/api/auth/me') },

  // ===== 上报（后端按登录角色自动限定数据范围：项目端=自己的，分公司端=本分公司，公司端=全部）=====
  addReport(report) { return request('POST', '/api/reports', report) },
  getReports(type) { return request('GET', '/api/reports' + (type ? '?type=' + type : '')) },
  getSummary() { return request('GET', '/api/reports/summary') },
  getReportStatus() { return request('GET', '/api/reports/status') },
  updateReportStatus(id, status) { return request('PUT', '/api/reports/' + id + '/status', { status }) },

  // ===== 项目定位 =====
  addLocation(location) { return request('POST', '/api/locations', location) },
  getLocations() { return request('GET', '/api/locations') },

  // ===== 气象预警 / 周一提醒 =====
  getWeather() { return request('GET', '/api/weather') },
  getMondayReminder() { return request('GET', '/api/reminder/monday') }
}
