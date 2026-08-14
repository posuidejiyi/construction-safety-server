// 后端完整链路测试：登录 → 上报定位（带经纬度）→ 列表 → 天气
const http = require('http');

const BASE = 'http://127.0.0.1:3100';

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
  // 1. 项目端登录（默认账号）
  let r = await req('POST', '/api/auth/login', { phone: '13800000003', password: 'admin123' });
  console.log('1. 项目端登录:', r.status, r.data.success, r.data.user ? (r.data.user.role + ' ' + r.data.user.name) : r.data.message);
  if (!r.data.success) process.exit(1);
  const projectToken = r.data.token;

  // 2. 项目端上报定位（带经纬度）
  r = await req('POST', '/api/locations', {
    province: '江苏省', city: '南京市', district: '玄武区',
    address: '江苏省南京市玄武区鸡鸣寺路',
    latitude: 32.0603, longitude: 118.7969
  }, projectToken);
  console.log('2. 上报定位:', r.status, r.data.success, r.data.location ? ('city=' + r.data.location.city + ' lat=' + r.data.location.latitude + ' lng=' + r.data.location.longitude) : r.data.message);
  if (!r.data.success) process.exit(1);

  // 3. 公司端登录
  r = await req('POST', '/api/auth/login', { phone: '13800000001', password: 'admin123' });
  console.log('3. 公司端登录:', r.status, r.data.success, r.data.user ? r.data.user.role : r.data.message);
  if (!r.data.success) process.exit(1);
  const companyToken = r.data.token;

  // 4. 公司端查定位列表（应该看到经纬度）
  r = await req('GET', '/api/locations', null, companyToken);
  console.log('4. 公司端定位列表:', r.status, (r.data.locations || []).length + ' 条');
  if (r.data.locations && r.data.locations.length > 0) {
    const loc = r.data.locations[0];
    console.log('   第1条: city=' + loc.city + ' district=' + loc.district + ' lat=' + loc.latitude + ' lng=' + loc.longitude + ' address=' + loc.address);
  }

  // 5. 天气接口（后端 mock 预警，验证定位驱动）
  r = await req('GET', '/api/weather', null, companyToken);
  console.log('5. 天气接口:', r.status, (r.data.warnings || []).length + ' 条预警');
  if (r.data.warnings && r.data.warnings.length > 0) {
    console.log('   第1条:', r.data.warnings[0].city, r.data.warnings[0].district, r.data.warnings[0].type + r.data.warnings[0].level);
  }

  // 6. 分公司端（南京公司）验证角色过滤
  r = await req('POST', '/api/auth/login', { phone: '13800000002', password: 'admin123' });
  const branchToken = r.data.token;
  r = await req('GET', '/api/locations', null, branchToken);
  console.log('6. 分公司端(南京公司)定位列表:', r.status, (r.data.locations || []).length + ' 条');

  console.log('\n=== ALL TESTS DONE ===');
})().catch((e) => { console.error('TEST FAIL:', e.message); process.exit(1); });
