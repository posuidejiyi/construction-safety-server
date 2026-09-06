// 汇总统计（与原小程序 store.getSummary 逻辑一致）
// “无”类上报（无危险作业 / 无危大工程 / 无机械设备）不计入汇总，避免“类型分布”出现无意义条目
const NONE_NAMES = {
  dangerWork: '无危险作业',
  dangerEng: '无',
  hazardSource: '',
  machinery: '无'
}

function isNoneItem(type, name) {
  const none = NONE_NAMES[type]
  return !!none && name === none
}

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
          if (isNoneItem('dangerWork', item.name)) return
          summary.dangerWork.total++
          summary.dangerWork.byType[item.name] = (summary.dangerWork.byType[item.name] || 0) + 1
        })
      } else if (r.subType && !isNoneItem('dangerWork', r.subType)) {
        summary.dangerWork.total++
        summary.dangerWork.byType[r.subType] = (summary.dangerWork.byType[r.subType] || 0) + 1
      }
    } else if (r.type === 'dangerEng') {
      if (r.items && r.items.length > 0) {
        r.items.forEach(item => {
          if (isNoneItem('dangerEng', item.name)) return
          summary.dangerEng.total++
          summary.dangerEng.byType[item.name] = (summary.dangerEng.byType[item.name] || 0) + 1
        })
      } else if (r.subType && !isNoneItem('dangerEng', r.subType)) {
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
      if (isNoneItem('machinery', r.subType)) return
      summary.machinery.total++
      summary.machinery.byType[r.subType] = (summary.machinery.byType[r.subType] || 0) + 1
      summary.machinery.totalQuantity += (r.quantity || 0)
    }
  })

  return summary
}

module.exports = { getSummary }
