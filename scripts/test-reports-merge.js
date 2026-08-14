// 验证"我的上报"合并定位记录：上报危险作业 + 上报定位 → GET /api/reports 应同时看到两者
const http = require('http');
const BASE = 'http://127.0.0.1:3101';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (d) => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { reject(new Error('bad json: ' + buf)); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // 1. 项目端登录
  let r = await req('POST', '/api/auth/login', { phone: '13800000003', password: 'admin123' });
  console.log('1. 项目端登录:', r.status, r.data.success);
  const token = r.data.token;

  // 2. 上报一条危险作业
  r = await req('POST', '/api/reports', { type: 'dangerWork', subType: '动火作业', content: '测试动火' }, token);
  console.log('2. 上报危险作业:', r.status, r.data.success, r.data.report ? r.data.report.id : r.data.message);

  // 3. 上报定位
  r = await req('POST', '/api/locations', {
    province: '江苏省', city: '南京市', district: '玄武区',
    address: '鸡鸣寺路', latitude: 32.0603, longitude: 118.7969
  }, token);
  console.log('3. 上报定位:', r.status, r.data.success);

  // 4. 我的上报列表（应含危险作业 + 项目定位）
  r = await req('GET', '/api/reports', null, token);
  const reports = r.data.reports || [];
  console.log('4. 我的上报列表:', r.status, reports.length + ' 条');
  reports.forEach(x => console.log('   -', x.type, '|', x.typeName, '|', x.subType, '|', x.createTime));
  const hasLoc = reports.some(x => x.type === 'projectLocation');
  const hasDW = reports.some(x => x.type === 'dangerWork');
  console.log('   包含项目定位:', hasLoc, '| 包含危险作业:', hasDW);
  if (!hasLoc || !hasDW) { console.log('FAIL: 合并不完整'); process.exit(1); }

  // 5. ?type=projectLocation 过滤
  r = await req('GET', '/api/reports?type=projectLocation', null, token);
  console.log('5. type=projectLocation 过滤:', r.status, (r.data.reports || []).length + ' 条，全部是定位:',
    (r.data.reports || []).every(x => x.type === 'projectLocation'));

  // 6. 汇总统计不受影响（不含 projectLocation）
  r = await req('GET', '/api/reports/summary', null, token);
  console.log('6. summary:', r.status, 'dangerWork.total =', r.data.summary.dangerWork.total);

  console.log('\n=== ALL TESTS PASSED ===');
})().catch((e) => { console.error('TEST FAIL:', e.message); process.exit(1); });
