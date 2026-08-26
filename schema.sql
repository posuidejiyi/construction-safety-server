-- 建筑安全监控 数据库结构（仅供查看；服务启动时会自动执行这些建表语句）
-- 在云托管控制台创建 MySQL 实例后，设置 DB_NAME 为 construction_safety 即可

CREATE DATABASE IF NOT EXISTS construction_safety DEFAULT CHARSET utf8mb4;
USE construction_safety;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  id_card VARCHAR(32) NOT NULL,
  phone VARCHAR(16) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(16) NOT NULL,
  project_id VARCHAR(64) NOT NULL DEFAULT '',
  project_name VARCHAR(128) NOT NULL DEFAULT '',
  branch VARCHAR(64) NOT NULL DEFAULT '',
  register_time VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(32) PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  type_name VARCHAR(32) NOT NULL,
  project_id VARCHAR(64) NOT NULL DEFAULT '',
  project_name VARCHAR(128) NOT NULL DEFAULT '',
  branch VARCHAR(64) NOT NULL DEFAULT '',
  reporter VARCHAR(64) NOT NULL,
  reporter_id VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT '待审核',
  data JSON NOT NULL,
  create_time VARCHAR(32) NOT NULL,
  INDEX idx_reporter_id (reporter_id),
  INDEX idx_branch (branch),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS locations (
  id VARCHAR(32) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL DEFAULT '',
  project_name VARCHAR(128) NOT NULL DEFAULT '',
  branch VARCHAR(64) NOT NULL DEFAULT '',
  province VARCHAR(64) NOT NULL DEFAULT '',
  city VARCHAR(64) NOT NULL,
  district VARCHAR(64) NOT NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',
  latitude DECIMAL(10,6) NULL,
  longitude DECIMAL(10,6) NULL,
  reporter VARCHAR(64) NOT NULL,
  reporter_id VARCHAR(32) NOT NULL,
  create_time VARCHAR(32) NOT NULL,
  INDEX idx_branch (branch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 月度危险源辨识：Excel 导入后整份存储（data 为行数组 JSON），
-- 服务启动时自动建表，无需手工执行
CREATE TABLE IF NOT EXISTS monthly_hazards (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT '',
  month VARCHAR(16) NOT NULL DEFAULT '',
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  row_count INT NOT NULL DEFAULT 0,
  risk_stats JSON NULL,
  project_id VARCHAR(64) NOT NULL DEFAULT '',
  project_name VARCHAR(128) NOT NULL DEFAULT '',
  branch VARCHAR(64) NOT NULL DEFAULT '',
  uploader VARCHAR(64) NOT NULL,
  uploader_id VARCHAR(32) NOT NULL,
  data JSON NOT NULL,
  create_time VARCHAR(32) NOT NULL,
  INDEX idx_uploader_id (uploader_id),
  INDEX idx_branch (branch),
  INDEX idx_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
