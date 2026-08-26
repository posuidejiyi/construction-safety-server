// 演示数据 + 健康验证（node fetch 方式，避免 shell 转义问题）
const BASE = 'https://zjbjszjs.cn'
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { status: res.status, data: await res.json() }
}
;(async () => {
  // 1. 健康检查
  const health = await call('GET', '/health')
  console.log('health:', health.status, JSON.stringify(health.data))
  // 2. 项目端登录（审核测试账号）
  const login = await call('POST', '/api/auth/login', { phone: '13800000003', password: 'admin123' })
  console.log('login 13800000003:', login.status, login.data.success ? 'OK' : JSON.stringify(login.data))
  const token = login.data.token
  // 3. 造演示数据：3 条上报 + 1 条定位
  const r1 = await call('POST', '/api/reports', { type: 'dangerWork', items: [{ name: '动火作业', level: '一级', content: '1号示范项目工地禁火区域内动火作业' }, { name: '高处作业', level: '二级', content: '5米以上脚手架高处作业' }] }, token)
  console.log('演示-危险作业:', r1.status, r1.data.report ? 'OK' : JSON.stringify(r1.data))
  const r2 = await call('POST', '/api/reports', { type: 'dangerEng', category: '房屋建筑和市政基础设施工程', items: [{ name: '深基坑工程', category: '房屋建筑和市政基础设施工程', level: '危大工程', content: '开挖深度5.2m基坑支护' }] }, token)
  console.log('演示-危大工程:', r2.status, r2.data.success ? 'OK' : JSON.stringify(r2.data))
  const r3 = await call('POST', '/api/reports', { type: 'machinery', subType: '塔式起重机', quantity: 2 }, token)
  console.log('演示-机械设备:', r3.status, r3.data.success ? 'OK' : JSON.stringify(r3.data))
  const loc = await call('POST', '/api/locations', { city: '江苏省', district: '南京市玄武区' }, token)
  console.log('演示-项目定位:', loc.status, loc.data.success ? 'OK' : JSON.stringify(loc.data))
  // 4. 分公司端验证能看到数据
  const branch = await call('POST', '/api/auth/login', { phone: '13800000002', password: 'admin123' })
  const btoken = branch.data.token
  const st = await call('GET', '/api/reports/status', {}, btoken)
  console.log('分公司状态接口:', st.status, st.data.status ? 'total=' + st.data.status.total : JSON.stringify(st.data))
  const sum = await call('GET', '/api/reports/summary', {}, (await call('POST', '/api/auth/login', { phone: '13800000001', password: 'admin123' })).data.token)
  console.log('公司端汇总:', sum.status, sum.data.summary ? 'OK' : JSON.stringify(sum.data))
  console.log('DONE')
})().catch(e => { console.error('异常:', e.message); process.exit(1) })
