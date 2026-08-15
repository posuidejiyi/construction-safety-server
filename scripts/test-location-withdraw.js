// 测试：位置上报撤销（DELETE /api/reports/:id 兼容 locations 表）
// 覆盖：位置上报可撤销 / 非本人不可撤 / 不存在 404 / 普通上报逻辑不回退
const http = require('http')

const BASE = 'http://127.0.0.1:3100'

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = http.request({ host: '127.0.0.1', port: 3100, path, method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 }, (res) => {
      let buf = ''
      res.on('data', c => buf += c)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(buf) } catch (e) {}
        resolve({ status: res.statusCode, json })
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

let pass = 0, fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : '') }
}

;(async () => {
  // 1. 项目端登录（13800000003 项目部负责人）
  const login = await req('POST', '/api/auth/login', { phone: '13800000003', password: 'admin123' })
  check('项目端登录', login.status === 200 && login.json.token, login.json)
  const token = login.json.token

  // 2. 上报一条位置
  const add = await req('POST', '/api/locations', {
    province: '江苏省', city: '南京市', district: '鼓楼区',
    address: '测试地址', latitude: 32.06, longitude: 118.78
  }, token)
  check('位置上报成功', add.status === 200 && add.json.location && add.json.location.id, add.json)
  const locId = add.json.location.id

  // 3. 列表里能看到（type=projectLocation）
  const list = await req('GET', '/api/reports?type=projectLocation', null, token)
  const inList = (list.json.reports || []).some(r => r.id === locId)
  check('位置记录出现在我的上报列表', inList, list.json)

  // 4. 撤销位置上报
  const del = await req('DELETE', '/api/reports/' + locId, null, token)
  check('位置上报撤销成功', del.status === 200 && del.json.success, del.json)

  // 5. 撤销后列表不再有
  const list2 = await req('GET', '/api/reports?type=projectLocation', null, token)
  const stillThere = (list2.json.reports || []).some(r => r.id === locId)
  check('撤销后列表已移除', !stillThere)

  // 6. 再撤销一次 → 404
  const del2 = await req('DELETE', '/api/reports/' + locId, null, token)
  check('重复撤销返回404', del2.status === 404, del2.json)

  // 7. 非本人撤销他人位置 → 403
  const add2 = await req('POST', '/api/locations', { province: '江苏省', city: '南京市', district: '玄武区', address: 'x', latitude: 32.05, longitude: 118.79 }, token)
  const locId2 = add2.json.location.id
  const login2 = await req('POST', '/api/auth/login', { phone: '13800000002', password: 'admin123' })
  const token2 = login2.json.token
  const del3 = await req('DELETE', '/api/reports/' + locId2, null, token2)
  check('他人(分公司账号)撤销项目定位被拒 403', del3.status === 403, del3.json)
  // 清理：本人撤销
  await req('DELETE', '/api/reports/' + locId2, null, token)

  // 8. 普通上报撤销逻辑不回退：已审核的上报不可撤
  const rep = await req('POST', '/api/reports', { type: 'dangerWork', typeName: '危险作业', subType: '高处作业', level: '一级', content: 'x' }, token)
  const repId = rep.json.report.id
  const login3 = await req('POST', '/api/auth/login', { phone: '13800000001', password: 'admin123' })
  const token3 = login3.json.token
  await req('PUT', '/api/reports/' + repId + '/status', { status: '已审核' }, token3)
  const del4 = await req('DELETE', '/api/reports/' + repId, null, token)
  check('已审核普通上报不可撤 400', del4.status === 400, del4.json)

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
})().catch(e => { console.error('ERR', e); process.exit(1) })
