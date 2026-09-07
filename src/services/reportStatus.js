// 项目上报状态
// 一个项目"已完成/已上报"必须同时完成全部 5 项任务：
//   危险作业 dangerWork / 危大工程 dangerEng / 危险源 hazardSource / 机械设备 machinery（上报表）
//   + 项目定位（定位表）
// 只有 5 项全部完成才计为"已上报"，缺任意一项都算"未上报"
const { ALL_REPORT_TYPES } = require('../data/constants')

// 5 项任务的 key 列表（顺序与前端 TODO_TASKS 一致）
const ALL_TASK_KEYS = ['dangerWork', 'dangerEng', 'hazardSource', 'machinery', 'projectLocation']

// 构建 reporterId -> { 已上报类型: true } 映射
function buildTypeMap(reports) {
  const map = {}
  ;(reports || []).forEach(r => {
    if (!r.reporterId || !r.type) return
    if (!map[r.reporterId]) map[r.reporterId] = {}
    map[r.reporterId][r.type] = true
  })
  return map
}

// 计算某项目缺失的任务 key 列表（即未完成项）
function getMissingTypes(reporterId, typeMap, locatedIds) {
  const types = typeMap[reporterId] || {}
  const hasLocation = locatedIds.has(reporterId)
  return ALL_TASK_KEYS.filter(k => (k === 'projectLocation' ? !hasLocation : types[k] !== true))
}

// 某分公司下项目上报状态
// projectUsers: 该分公司的 project 角色用户列表；reports: 该分公司的上报列表；locations: 该分公司的定位列表
function getProjectReportStatus(projectUsers, reports, locations) {
  const typeMap = buildTypeMap(reports)
  const locatedIds = new Set((locations || []).map(l => l.reporterId))
  const reported = []
  const unreported = []

  projectUsers.forEach(p => {
    const missingTypes = getMissingTypes(p.id, typeMap, locatedIds)
    const item = { name: p.name, projectName: p.projectName, branch: p.branch, phone: p.phone, missingTypes }
    if (missingTypes.length === 0) {
      reported.push(item)
    } else {
      unreported.push(item)
    }
  })

  return {
    total: projectUsers.length,
    reportedCount: reported.length,
    unreportedCount: unreported.length,
    reported,
    unreported
  }
}

// 全公司项目上报状态（按分公司分组）
function getAllProjectReportStatus(projectUsers, reports, locations) {
  const typeMap = buildTypeMap(reports)
  const locatedIds = new Set((locations || []).map(l => l.reporterId))
  const branchMap = {}

  projectUsers.forEach(p => {
    if (!branchMap[p.branch]) {
      branchMap[p.branch] = { branch: p.branch, total: 0, reportedCount: 0, unreportedCount: 0, reported: [], unreported: [] }
    }
    branchMap[p.branch].total++
    const missingTypes = getMissingTypes(p.id, typeMap, locatedIds)
    const item = { name: p.name, projectName: p.projectName, branch: p.branch, phone: p.phone, missingTypes }
    if (missingTypes.length === 0) {
      branchMap[p.branch].reportedCount++
      branchMap[p.branch].reported.push(item)
    } else {
      branchMap[p.branch].unreportedCount++
      branchMap[p.branch].unreported.push(item)
    }
  })

  const branches = Object.values(branchMap).sort((a, b) => b.total - a.total)
  return {
    total: projectUsers.length,
    reportedCount: projectUsers.filter(p => getMissingTypes(p.id, typeMap, locatedIds).length === 0).length,
    unreportedCount: projectUsers.filter(p => getMissingTypes(p.id, typeMap, locatedIds).length > 0).length,
    branches
  }
}

module.exports = { getProjectReportStatus, getAllProjectReportStatus }
