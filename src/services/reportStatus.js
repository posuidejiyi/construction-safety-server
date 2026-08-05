// 项目上报状态（与原小程序 getProjectReportStatus / getAllProjectReportStatus 一致）

// 某分公司下项目上报状态
// projectUsers: 该分公司的 project 角色用户列表；reports: 该分公司的上报列表
function getProjectReportStatus(projectUsers, reports) {
  const reportedIds = new Set(reports.map(r => r.reporterId))
  const reported = []
  const unreported = []

  projectUsers.forEach(p => {
    if (reportedIds.has(p.id)) {
      reported.push(p)
    } else {
      unreported.push({ name: p.name, projectName: p.projectName, branch: p.branch, phone: p.phone })
    }
  })

  return {
    total: projectUsers.length,
    reportedCount: reported.length,
    unreportedCount: unreported.length,
    unreported
  }
}

// 全公司项目上报状态（按分公司分组）
function getAllProjectReportStatus(projectUsers, reports) {
  const reportedIds = new Set(reports.map(r => r.reporterId))
  const branchMap = {}

  projectUsers.forEach(p => {
    if (!branchMap[p.branch]) {
      branchMap[p.branch] = { branch: p.branch, total: 0, reportedCount: 0, unreportedCount: 0, unreported: [] }
    }
    branchMap[p.branch].total++
    if (reportedIds.has(p.id)) {
      branchMap[p.branch].reportedCount++
    } else {
      branchMap[p.branch].unreportedCount++
      branchMap[p.branch].unreported.push({ name: p.name, projectName: p.projectName, branch: p.branch, phone: p.phone })
    }
  })

  const branches = Object.values(branchMap).sort((a, b) => b.total - a.total)
  return {
    total: projectUsers.length,
    reportedCount: projectUsers.filter(p => reportedIds.has(p.id)).length,
    unreportedCount: projectUsers.filter(p => !reportedIds.has(p.id)).length,
    branches
  }
}

module.exports = { getProjectReportStatus, getAllProjectReportStatus }
