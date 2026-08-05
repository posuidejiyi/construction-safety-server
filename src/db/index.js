// 数据库驱动选择：DB_DRIVER=mysql 用 MySQL，否则本地开发用 memory
const config = require('../config')
const driver = config.db.driver === 'mysql' ? require('./mysql') : require('./memory')
module.exports = driver
