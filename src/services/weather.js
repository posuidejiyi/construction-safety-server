// 气象预警 Mock 生成（与原小程序 util.genWeatherWarning 一致）
const { WEATHER_WARNING_TYPES } = require('../data/constants')
const { genId, formatTime } = require('../utils/gen')

function genWeatherWarning(city, district) {
  const idx = Math.floor(Math.random() * WEATHER_WARNING_TYPES.length)
  const w = WEATHER_WARNING_TYPES[idx]
  const levels = ['蓝色', '黄色', '橙色', '红色']
  const levelIdx = Math.floor(Math.random() * levels.length)
  return {
    id: genId('W'),
    city,
    district,
    type: w.type,
    level: levels[levelIdx],
    color: w.color,
    content: `${district}${w.type}${levels[levelIdx]}预警：预计未来24小时内${district}将出现${w.type}天气，请注意防范。`,
    publishTime: formatTime(new Date(Date.now() - Math.floor(Math.random() * 3600000)))
  }
}

module.exports = { genWeatherWarning }
