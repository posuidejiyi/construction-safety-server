// 后端业务常量（从小程序 utils/constants.js 抽取后端需要的部分）

const ROLES = { PROJECT: 'project', BRANCH: 'branch', COMPANY: 'company' }
const ROLE_NAMES = { project: '项目端', branch: '分公司端', company: '公司端' }

// 上报类型
const REPORT_TYPES = {
  DANGER_WORK: 'dangerWork',
  DANGER_ENG: 'dangerEng',
  HAZARD_SOURCE: 'hazardSource',
  MACHINERY: 'machinery'
}
const REPORT_TYPE_NAMES = {
  dangerWork: '危险作业',
  dangerEng: '危大工程',
  hazardSource: '危险源清单',
  machinery: '机械设备'
}
const ALL_REPORT_TYPES = ['dangerWork', 'dangerEng', 'hazardSource', 'machinery']

// 分公司列表（注册时校验用）
const BRANCHES = [
  '南京公司', '上海公司', '苏南公司', '西南公司', '中南公司', '华中公司', '基础设施公司',
  '苏中公司', '安装公司', '浙江公司', '海外公司', '智造产业公司', '徐州公司', '装饰公司'
]

// 气象预警类型（与小程序端一致）
const WEATHER_WARNING_TYPES = [
  { type: '暴雨', color: 'blue', icon: 'rain' },
  { type: '大风', color: 'orange', icon: 'wind' },
  { type: '雷电', color: 'yellow', icon: 'thunder' },
  { type: '高温', color: 'red', icon: 'hot' },
  { type: '寒潮', color: 'blue', icon: 'cold' },
  { type: '冰雹', color: 'orange', icon: 'hail' },
  { type: '台风', color: 'red', icon: 'typhoon' },
  { type: '大雾', color: 'yellow', icon: 'fog' }
]

module.exports = {
  ROLES, ROLE_NAMES, REPORT_TYPES, REPORT_TYPE_NAMES, ALL_REPORT_TYPES, BRANCHES, WEATHER_WARNING_TYPES
}
