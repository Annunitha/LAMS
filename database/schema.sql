CREATE DATABASE IF NOT EXISTS land_acquisition;
USE land_acquisition;

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(220) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(120) NOT NULL,
  agency VARCHAR(160) NOT NULL,
  stage VARCHAR(80) NOT NULL,
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  proposed_area DECIMAL(12,2) NOT NULL DEFAULT 0,
  acquired_area DECIMAL(12,2) NOT NULL DEFAULT 0,
  compensation_assessed DECIMAL(14,2) NOT NULL DEFAULT 0,
  compensation_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  affected_families INT UNSIGNED NOT NULL DEFAULT 0,
  displaced_families INT UNSIGNED NOT NULL DEFAULT 0,
  rr_progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  possession_status VARCHAR(40) NOT NULL DEFAULT 'Not started',
  days_in_stage INT UNSIGNED NOT NULL DEFAULT 0,
  deadline_days INT UNSIGNED NOT NULL DEFAULT 30,
  latitude DECIMAL(10,7) NOT NULL DEFAULT 22.8000000,
  longitude DECIMAL(10,7) NOT NULL DEFAULT 79.0000000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX projects_state_stage (state, stage),
  INDEX projects_updated_at (updated_at)
);

CREATE TABLE IF NOT EXISTS project_milestones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  stage_name VARCHAR(80) NOT NULL,
  estimated_date DATE NULL,
  completion_date DATE NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY milestone_project_stage (project_id, stage_name),
  CONSTRAINT milestone_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestone_documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  milestone_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_name CHAR(40) NOT NULL UNIQUE,
  media_type ENUM('application/pdf', 'text/plain') NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_by VARCHAR(80) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT milestone_document_fk FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE,
  INDEX milestone_documents_uploaded (milestone_id, uploaded_at)
);