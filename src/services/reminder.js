// 周一上报提醒（本周口径：只统计本周一 00:00 之后的上报/定位）
const { getProjectReportStatus, getAllProjectReportStatus } = require('./reportStatus')

function isMonday() {
  return new Date().getDay() === 1
}

// 本周一 00:00 的 'YYYY-MM-DD HH:mm' 字符串（与 create_time 格式一致，可直接字符串比较）
function weekStartStr() {
  const now = new Date()
  const day = now.getDay() // 0=周日 ... 6=周六
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  const pad = n => String(n).padStart(2, '0')
  return monday.getFullYear() + '-' + pad(monday.getMonth() + 1) + '-' + pad(monday.getDate()) + ' 00:00'
}

// user: 当前用户；projectUsers: 全部 project 角色用户；reports/locations: 当前用户可见范围（含全部历史）
function checkMondayReportReminder(user, projectUsers, reports, locations) {
  if (!user || !isMonday()) return null
  const weekStart = weekStartStr()
  const weekReports = (reports || []).filter(r => String(r.createTime || '') >= weekStart)
  const weekLocations = (locations || []).filter(l => String(l.createTime || '') >= weekStart)

  // 项目端：检查本周自身上报情况（项目定位走 locations 表）
  if (user.role === 'project') {
    const myReports = weekReports.filter(r => r.reporterId === user.id)
    const myLocations = weekLocations.filter(l => l.reporterId === user.id)
    if (myReports.length === 0 && myLocations.length === 0) {
      return { title: '周一上报提醒', content: '本周尚未进行安全上报，请尽快完成上报工作。安全无小事，请及时上报！', action: 'goReport' }
    }
    const types = ['dangerWork', 'dangerEng', 'hazardSource', 'machinery', 'projectLocation']
    const names = { dangerWork: '危险作业', dangerEng: '危大工程', hazardSource: '危险源清单', machinery: '机械设备', projectLocation: '项目定位' }
    const missingTypes = types.filter(t => {
      if (t === 'projectLocation') return myLocations.length === 0
      return !myReports.some(r => r.type === t)
    })
    if (missingTypes.length > 0) {
      return { title: '周一上报提醒', content: `以下上报尚未完成：${missingTypes.map(t => names[t]).join('、')}，请尽快完成！`, action: 'goReport' }
    }
    return null
  }

  // 分公司端：检查分公司下未上报的项目（本周口径）
  if (user.role === 'branch') {
    const branchUsers = projectUsers.filter(p => p.role === 'project' && p.branch === user.branch)
    const branchReports = weekReports.filter(r => r.branch === user.branch)
    const status = getProjectReportStatus(branchUsers, branchReports)
    if (status.unreportedCount > 0) {
      const names = status.unreported.map(u => u.projectName).join('、')
      return { title: '项目上报提醒', content: `${user.branch}共有${status.unreportedCount}个项目本周尚未上报：${names}`, action: 'goDashboard' }
    }
    return null
  }

  // 公司端：检查全公司未上报的项目（本周口径）
  if (user.role === 'company') {
    const status = getAllProjectReportStatus(projectUsers, weekReports)
    if (status.unreportedCount > 0) {
      return { title: '项目上报提醒', content: `全公司共有${status.unreportedCount}个项目本周尚未上报（共${status.total}个项目），请督促各分公司尽快完成上报。`, action: 'goDashboard' }
    }
    return null
  }

  return null
}

module.exports = { checkMondayReportReminder }
