// 撤回上报接口测试（跑在本地 memory 驱动服务上）
// 用法：node scripts/test-withdraw.js <baseUrl>
const BASE = process.argv[2] || 'http://127.0.0.1:3999'

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  let data = null
  try { data = await res.json() } catch (e) {}
  return { status: res.status, data }
}

function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''))
  if (!cond) process.exitCode = 1
}

async function main() {
  // 1. 登录：项目端用户 + 分公司用户
  const p = await req('POST', '/api/auth/login', null, { phone: '13800000003', password: 'admin123' })
  const b = await req('POST', '/api/auth/login', null, { phone: '13800000002', password: 'admin123' })
  check('项目端登录', p.status === 200, 'status=' + p.status)
  check('分公司端登录', b.status === 200, 'status=' + b.status)
  const pt = p.data.token
  const bt = b.data.token

  // 2. 项目端创建一条上报
  const rep = await req('POST', '/api/reports', pt, { type: 'dangerWork', items: [{ name: '高处作业', level: '一级', content: '测试' }], subType: '高处作业' })
  check('创建上报', rep.status === 200, 'status=' + rep.status)
  const rid = rep.data.report.id

  // 3. 分公司端撤回别人的上报 → 403
  const r3 = await req('DELETE', '/api/reports/' + rid, bt)
  check('他人不可撤回(403)', r3.status === 403, JSON.stringify(r3.data))

  // 4. 分公司端把状态改为已审核
  const r4 = await req('PUT', '/api/reports/' + rid + '/status', bt, { status: '已审核' })
  check('改为已审核', r4.status === 200, 'status=' + r4.status)

  // 5. 已审核后本人撤回 → 400
  const r5 = await req('DELETE', '/api/reports/' + rid, pt)
  check('已审核不可撤回(400)', r5.status === 400, JSON.stringify(r5.data))

  // 6. 状态改回待审核，本人撤回 → 200
  await req('PUT', '/api/reports/' + rid + '/status', bt, { status: '待审核' })
  const r6 = await req('DELETE', '/api/reports/' + rid, pt)
  check('待审核可撤回(200)', r6.status === 200, JSON.stringify(r6.data))

  // 7. 重复撤回 → 404
  const r7 = await req('DELETE', '/api/reports/' + rid, pt)
  check('重复撤回返回404', r7.status === 404, JSON.stringify(r7.data))

  // 8. 列表确认已删除
  const list = await req('GET', '/api/reports', pt)
  const found = (list.data.reports || []).some(r => r.id === rid)
  check('列表不再包含该上报', !found)

  // 9. 未登录撤回 → 401
  const r9 = await req('DELETE', '/api/reports/' + rid, '')
  check('未登录返回401', r9.status === 401, 'status=' + r9.status)

  console.log(process.exitCode ? '\n有失败项' : '\n全部通过')
}

main().catch(e => { console.error('脚本异常：', e); process.exit(1) })
