// 汇总统计（与原小程序 store.getSummary 逻辑一致）
function getSummary(reports) {
  const summary = {
    dangerWork: { total: 0, byType: {} },
    dangerEng: { total: 0, byType: {} },
    hazardSource: { total: 0, byType: {} },
    machinery: { total: 0, byType: {}, totalQuantity: 0 }
  }

  reports.forEach(r => {
    if (r.type === 'dangerWork') {
      if (r.items && r.items.length > 0) {
        r.items.forEach(item => {
          summary.dangerWork.total++
          summary.dangerWork.byType[item.name] = (summary.dangerWork.byType[item.name] || 0) + 1
        })
      } else if (r.subType) {
        summary.dangerWork.total++
        summary.dangerWork.byType[r.subType] = (summary.dangerWork.byType[r.subType] || 0) + 1
      }
    } else if (r.type === 'dangerEng') {
      if (r.items && r.items.length > 0) {
        r.items.forEach(item => {
          summary.dangerEng.total++
          summary.dangerEng.byType[item.name] = (summary.dangerEng.byType[item.name] || 0) + 1
        })
      } else if (r.subType) {
        summary.dangerEng.total++
        summary.dangerEng.byType[r.subType] = (summary.dangerEng.byType[r.subType] || 0) + 1
      }
    } else if (r.type === 'hazardSource') {
      if (r.items && r.items.length > 0) {
        r.items.forEach(item => {
          summary.hazardSource.total++
          summary.hazardSource.byType[item.name] = (summary.hazardSource.byType[item.name] || 0) + 1
        })
      } else if (r.subType) {
        summary.hazardSource.total++
        summary.hazardSource.byType[r.subType] = (summary.hazardSource.byType[r.subType] || 0) + 1
      }
    } else if (r.type === 'machinery') {
      summary.machinery.total++
      summary.machinery.byType[r.subType] = (summary.machinery.byType[r.subType] || 0) + 1
      summary.machinery.totalQuantity += (r.quantity || 0)
    }
  })

  return summary
}

module.exports = { getSummary }
