// 后端冒烟测试：node scripts/smoke.js
// 覆盖：健康检查、注册、登录、四类上报、定位、汇总、上报状态、审核、重置密码
// 默认连接本地 memory 模式服务；可用 BASE_URL 指定远端（如 BASE_URL=https://xxx.weixincloud.run node scripts/smoke.js）
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100'

let pass = 0
let fail = 0

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: (body && method !== 'GET') ? JSON.stringify(body) : undefined
  })
  return { status: res.status, data: await res.json() }
}

function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅', name) }
  else { fail++; console.log('  ❌', name, extra !== undefined ? JSON.stringify(extra) : '') }
}

async function main() {
  // 1. 健康检查
  const health = await call('GET', '/health')
  check('健康检查', health.status === 200 && health.data.status === 'ok')

  // 2. 注册一个新项目端用户（手机号/身份证号每次运行都唯一，可重复执行）
  const phone = '139' + String(Date.now()).slice(-8)
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const idCard = '1101011990' + mm + dd + String(Date.now()).slice(-3) + 'X'
  const reg = await call('POST', '/api/auth/register', {
    name: '测试员', idCard,
    phone,
    password: 'test123456', role: 'project', branch: '南京公司', projectName: '测试项目A'
  })
  check('注册项目端用户', reg.status === 200 && reg.data.success === true, reg.data)

  // 3. 重复注册应失败
  const dup = await call('POST', '/api/auth/register', {
    name: '测试员2', idCard: '110101199003074528',
    phone,
    password: 'test123456', role: 'project', branch: '南京公司', projectName: '测试项目B'
  })
  check('重复手机号注册被拒绝', dup.status === 400, dup.data)

  // 4. 新用户登录
  const login = await call('POST', '/api/auth/login', { phone, password: 'test123456' })
  check('新用户登录', login.status === 200 && login.data.success && login.data.token)
  const token = login.data.token
  check('登录返回用户信息', login.data.user && login.data.user.role === 'project' && !login.data.user.idCard, login.data.user)

  // 5. 默认账号登录（公司管理员 admin123）
  const admin = await call('POST', '/api/auth/login', { phone: '13800000001', password: 'admin123' })
  check('默认公司账号登录', admin.status === 200 && admin.data.success)
  const adminToken = admin.data.token

  const branch = await call('POST', '/api/auth/login', { phone: '13800000002', password: 'admin123' })
  const branchToken = branch.data.token

  // 6. 危险作业上报
  const r1 = await call('POST', '/api/reports', {
    type: 'dangerWork',
    items: [{ name: '动火作业', level: '一级', content: '禁火区域内动火' }, { name: '高处作业', level: '二级', content: '5米高处作业' }]
  }, token)
  check('危险作业上报', r1.status === 200 && r1.data.report && r1.data.report.items.length === 2, r1.data)
  check('上报自动带项目信息', r1.data.report.projectName === '测试项目A' && r1.data.report.status === '待审核', r1.data.report)

  // 7. 危大工程上报
  const r2 = await call('POST', '/api/reports', {
    type: 'dangerEng',
    items: [{ name: '深基坑工程', category: '房屋建筑和市政基础设施工程', level: '危大工程', content: '开挖深度5m' }],
    category: '房屋建筑和市政基础设施工程'
  }, token)
  check('危大工程上报', r2.status === 200 && r2.data.success)

  // 8. 危险源清单上报
  const r3 = await call('POST', '/api/reports', {
    type: 'hazardSource',
    items: [{ name: '基坑工程', level: '重大风险', content: '开挖深度超过3m' }]
  }, token)
  check('危险源清单上报', r3.status === 200 && r3.data.success)

  // 9. 机械设备上报
  const r4 = await call('POST', '/api/reports', { type: 'machinery', subType: '塔式起重机', quantity: 3 }, token)
  check('机械设备上报', r4.status === 200 && r4.data.success)

  // 10. 项目定位上报
  const loc = await call('POST', '/api/locations', { city: '江苏省', district: '南京市玄武区' }, token)
  check('项目定位上报', loc.status === 200 && loc.data.success)

  // 11. 我的上报列表（项目端只看自己；定位也会作为 projectLocation 合并进列表）
  const mine = await call('GET', '/api/reports', {}, token)
  const mineTypes = mine.data.reports.map(r => r.type)
  check('项目端上报列表=5条(4类上报+1定位)', mine.status === 200 && mine.data.reports.length === 5 && mineTypes.includes('projectLocation'), mine.data.reports && mine.data.reports.length)

  // 12. 汇总（公司端）
  const summary = await call('GET', '/api/reports/summary', {}, adminToken)
  check('公司端汇总', summary.status === 200 && summary.data.summary.dangerWork.total >= 2 && summary.data.summary.machinery.totalQuantity >= 3, summary.data.summary)

  // 13. 上报状态（分公司端）
  const st = await call('GET', '/api/reports/status', {}, branchToken)
  check('分公司端上报状态', st.status === 200 && st.data.status && typeof st.data.status.total === 'number', st.data)

  // 14. 审核（分公司端把一条改为已审核）
  const audited = await call('PUT', `/api/reports/${r1.data.report.id}/status`, { status: '已审核' }, branchToken)
  check('分公司审核上报', audited.status === 200 && audited.data.report.status === '已审核', audited.data)

  // 15. 气象预警（公司端）
  const wx = await call('GET', '/api/weather', {}, adminToken)
  check('气象预警接口', wx.status === 200 && Array.isArray(wx.data.warnings))

  // 16. 重置密码
  const rp = await call('POST', '/api/auth/reset-password', { phone, idCard, newPassword: 'newpass666' })
  check('重置密码', rp.status === 200 && rp.data.success, rp.data)
  const relogin = await call('POST', '/api/auth/login', { phone, password: 'newpass666' })
  check('新密码登录成功', relogin.status === 200 && relogin.data.success)

  // 17. 未带 token 访问应 401
  const noauth = await call('GET', '/api/reports')
  check('未登录被拦截', noauth.status === 401, noauth.data)

  console.log(`\n结果：${pass} 通过，${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('冒烟测试异常:', e); process.exit(1) })
