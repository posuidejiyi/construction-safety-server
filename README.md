# 建筑安全监控 —— 后端服务（微信云托管）

对应小程序 `construction-safety` 的后端，接口和数据模型与小程序端完全对齐（用户/四类上报/项目定位/汇总统计/上报状态/周一提醒/气象预警）。

## 技术栈

- Node.js + Express
- 数据存储：MySQL（云托管内置 MySQL）；本地开发可用 memory 模式（零依赖，重启丢数据）
- 认证：手机号+密码登录，JWT Token；密码 bcrypt 加密存储
- 部署：Docker 容器，一键部署到微信云托管

## 目录结构

```
construction-safety-server/
├── src/
│   ├── server.js            # 入口
│   ├── app.js               # Express 装配
│   ├── config.js            # 环境变量配置
│   ├── db/                  # 数据层（mysql.js 生产 / memory.js 本地）
│   ├── middleware/auth.js   # JWT 鉴权
│   ├── routes/              # auth / reports / locations / weather / reminder
│   ├── services/            # 汇总、上报状态、周一提醒、气象预警（与小程序逻辑一致）
│   └── data/constants.js    # 角色、上报类型、分公司列表
├── frontend/utils/api.js    # 小程序端请求封装（复制到小程序 utils/ 下使用）
├── scripts/smoke.js         # 接口冒烟测试
├── Dockerfile
└── schema.sql               # 表结构参考（服务启动时自动建表，无需手工执行）
```

## 一、本地运行（开发调试）

```bash
npm install
npm start          # 默认 memory 模式，端口 3000
```

另开一个终端跑冒烟测试（覆盖注册/登录/四类上报/定位/汇总/审核/重置密码）：

```bash
node scripts/smoke.js
```

> memory 模式数据存在内存里，重启即清空，仅用于开发验证。
> 本地连 MySQL：复制 `.env.example` 为 `.env`，设置 `DB_DRIVER=mysql` 及数据库连接信息。

## 二、部署到微信云托管（第四步）

### 1. 开通云托管、创建环境

小程序后台 →「开发」→「云托管」（或 cloud.weixin.qq.com），开通服务、创建**环境**。
按量计费，需要先给腾讯云账号充值（最低充值 1 元，容器按秒计费）。

### 2. 创建内置 MySQL 数据库

环境 →「数据库」→ 创建 MySQL 实例（建议选基础版即可），记下：
`内网地址 / 端口 / 账号 / 密码 / 库名`（库名建议 `construction_safety`）。

### 3. 构建镜像并推送

本地装好 Docker 后，在项目目录执行（仓库地址/登录命令在云托管控制台「服务 → 创建服务 → 镜像来源」里能看到）：

```bash
# 登录腾讯云镜像仓库（控制台提供完整命令）
docker login ccr.ccs.tencentyun.com --username=你的账号

# 构建并推送
docker build -t ccr.ccs.tencentyun.com/<命名空间>/<仓库名>/construction-safety:latest .
docker push ccr.ccs.tencentyun.com/<命名空间>/<仓库名>/construction-safety:latest
```

> 也可以选择「代码仓库」方式：把本项目推到 GitHub/Gitee，控制台关联仓库并填 Dockerfile 路径，自动构建。

### 4. 创建服务、配置环境变量

控制台创建服务，选刚推送的镜像，**端口填 80**，然后设置环境变量：

| 变量 | 值 |
|---|---|
| `PORT` | `80` |
| `JWT_SECRET` | 一串随机长字符串（必改！） |
| `DB_DRIVER` | `mysql` |
| `DB_HOST` | 内置 MySQL 的内网地址 |
| `DB_PORT` | 内置 MySQL 的端口（默认 3306） |
| `DB_USER` / `DB_PASSWORD` | 数据库账号密码 |
| `DB_NAME` | `construction_safety` |
| `DATA_RETENTION_DAYS` | `0`（0=永久保留；原小程序是每 7 天清空，想复刻设 7） |

> 服务首次启动会自动建表并创建 3 个默认账号（13800000001~3 / admin123），无需手工执行 SQL。

### 5. 发布版本、配置域名

「发布」后拿到默认域名（形如 `https://xxx.weixincloud.run`，只能从小程序内访问，无需备案）。

到小程序后台「开发 → 开发设置 → 服务器域名」，把该域名加入 **request 合法域名**。

### 6. 验证

```bash
BASE_URL=https://你的域名.weixincloud.run node scripts/smoke.js
```

全部 ✅ 即后端部署成功。

## 三、前端对接指引（第五步）

1. 把 `frontend/utils/api.js` 复制到小程序 `utils/` 目录，改 `BASE_URL` 为你的云托管域名。
2. 登录成功（`api.login()`）后：`wx.setStorageSync(api.TOKEN_KEY, res.token)`，并把 `res.user` 写入 `app.globalData` 和 `cs_current_user`（保持现有页面结构不变）。
3. 按页面逐个把 `store.xxx` 换成 `api.xxx`（都是 Promise，页面里 `store.addReport(report)` 改成 `api.addReport(report).then(...)`）：

| 原 store 调用 | 替换为 |
|---|---|
| `store.registerUser(data)` | `api.register(data)` |
| `store.loginUser(phone, pwd)` | `api.login(phone, pwd)` |
| `store.resetPassword(...)` | `api.resetPassword(...)` |
| `store.addReport(report)` | `api.addReport(report)`（后端自动带项目/人员信息，report 里可去掉 id/projectId/branch/reporter 等字段） |
| `store.getMyReports(user.id)` | `api.getReports()` |
| `store.getReportsByBranch(branch)` | `api.getReports()`（分公司账号自动只看本分公司） |
| `store.getAllReports()` | `api.getReports()`（公司账号自动看全部） |
| `store.getSummary(reports)` | `api.getSummary()` |
| `store.getProjectReportStatus(...)` / `getAllProjectReportStatus()` | `api.getReportStatus()` |
| `store.addLocation(loc)` | `api.addLocation({ city, district })` |
| `store.getLocationsByBranch(...)` / `getAllLocations()` | `api.getLocations()` |
| `store.getWeatherWarnings(locations)` | `api.getWeather()` |
| `store.checkMondayReportReminder(user)` | `api.getMondayReminder()` |
| `store.checkWeeklyClear()` / `resetAllDataAndAccounts()` | 删除（云端数据不自动清空；如需每周清空见 `DATA_RETENTION_DAYS`） |

4. 删除 `app.js` 里的 `CS_FORCE_RESET_V2` 强制清数据逻辑（否则用户一打开小程序就被清号）。
5. 开发阶段：开发者工具右上角「详情 → 本地设置」勾选「不校验合法域名」；上线前取消勾选。

## 四、接口一览

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/auth/register` | 注册（姓名/身份证/手机号/密码/角色/分公司/项目名） | 公开 |
| POST | `/api/auth/login` | 登录，返回 token + 用户信息 | 公开 |
| POST | `/api/auth/reset-password` | 手机号+身份证重置密码 | 公开 |
| GET | `/api/auth/me` | 当前用户信息 | 登录 |
| POST | `/api/reports` | 创建上报（type: dangerWork/dangerEng/hazardSource/machinery） | 登录 |
| GET | `/api/reports?type=` | 上报列表（按角色自动限定范围） | 登录 |
| GET | `/api/reports/summary` | 汇总统计 | 登录 |
| GET | `/api/reports/status` | 项目上报状态（分公司/公司端） | 登录 |
| PUT | `/api/reports/:id/status` | 审核（待审核/已审核/已驳回） | 分公司/公司 |
| POST | `/api/locations` | 项目定位上报（城市/地区） | 登录 |
| GET | `/api/locations` | 定位列表 | 登录 |
| GET | `/api/weather` | 气象预警（基于定位生成） | 登录 |
| GET | `/api/reminder/monday` | 周一上报提醒 | 登录 |
| GET | `/health` | 健康检查 | 公开 |

## 五、说明与注意

- **与原小程序的行为差异**：原版把密码明文存在手机本地、每 7 天清空全部数据；云端版本密码 bcrypt 加密、默认永久保留（保留期可配）。历史数据不会自动迁移，上线后从新开始积累。
- **人脸识别**：注册流程已移除人脸识别（`wx.startFacialRecognitionVerify`），后端注册接口不依赖任何生物识别能力；如后续要重新启用，需在小程序后台申请开通「人脸核身」权限。
- **图片上报**：当前版本上报不含照片；后续加照片时，把 `wx.uploadFile` 指向云托管服务（或对象存储 COS），再在报告中记录 URL 即可。
