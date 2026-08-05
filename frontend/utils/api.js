// utils/api.js —— 对接后端服务的请求封装
// 使用方法：把本文件复制到小程序项目的 utils/ 目录下，
// 登录成功后把 token 存到 storage（key: cs_token），其余接口自动带上。
// 参考 README 中的「前端对接指引」改造各页面。
const BASE_URL = 'https://你的域名.weixincloud.run' // TODO: 改成你的云托管服务域名（第四步完成后获得）

const TOKEN_KEY = 'cs_token'

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
          wx.removeStorageSync(TOKEN_KEY)
          wx.removeStorageSync('cs_current_user')
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

module.exports = {
  BASE_URL,
  TOKEN_KEY,

  // ===== 认证 =====
  register(data) { return request('POST', '/api/auth/register', data) },
  login(phone, password) { return request('POST', '/api/auth/login', { phone, password }) },
  resetPassword(phone, idCard, newPassword) {
    return request('POST', '/api/auth/reset-password', { phone, idCard, newPassword })
  },
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
