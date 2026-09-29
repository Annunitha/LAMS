import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { createMilestones, lifecycleStages, seedProjects } from './seed.js';

const pool = process.env.MYSQL_URL
  ? mysql.createPool(process.env.MYSQL_URL)
  : process.env.DB_HOST
    ? mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'land_acquisition',
        waitForConnections: true,
        connectionLimit: 5,
      })
    : null;

let demoProjects = structuredClone(seedProjects);
const demoStatePath = fileURLToPath(new URL('../data/demo-projects.json', import.meta.url));
let demoWriteQueue = Promise.resolve();

await mkdir(path.dirname(demoStatePath), { recursive: true });
try {
  demoProjects = JSON.parse(await readFile(demoStatePath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function persistDemoProjects() {
  const contents = JSON.stringify(demoProjects, null, 2);
  demoWriteQueue = demoWriteQueue.then(async () => {
    const temporaryPath = `${demoStatePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, demoStatePath);
  });
  return demoWriteQueue;
}

function dbDate(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapMilestoneDocuments(rows) {
  return rows.map((row) => ({
    id: String(row.id),
    fileName: row.file_name,
    mediaType: row.media_type,
    fileSize: Number(row.file_size),
    uploadedBy: row.uploaded_by,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
    url: `/api/documents/${row.id}`,
    storageName: row.storage_name,
  }));
}

async function ensureMilestones(projectId, currentStage) {
  if (!pool) return;
  const milestones = createMilestones(currentStage);
  const values = milestones.map((milestone) => [projectId, milestone.stage, milestone.estimatedDate, milestone.completionDate, milestone.note]);
  await pool.query(
    'INSERT IGNORE INTO project_milestones (project_id, stage_name, estimated_date, completion_date, note) VALUES ?',
    [values],
  );
}

async function attachMilestones(projects) {
  if (!pool || projects.length === 0) return projects;
  for (const project of projects) await ensureMilestones(project.id, project.stage);
  const [milestoneRows] = await pool.query(
    `SELECT m.* FROM project_milestones m
     WHERE m.project_id IN (?) ORDER BY m.id`,
    [projects.map((project) => project.id)],
  );
  const [documentRows] = await pool.query(
    `SELECT d.*, m.project_id, m.stage_name FROM milestone_documents d
     JOIN project_milestones m ON m.id = d.milestone_id
     WHERE m.project_id IN (?) ORDER BY d.uploaded_at DESC`,
    [projects.map((project) => project.id)],
  );
  const documentsByMilestone = new Map();
  for (const row of documentRows) {
    const documents = documentsByMilestone.get(String(row.milestone_id)) || [];
    documents.push(mapMilestoneDocuments([row])[0]);
    documentsByMilestone.set(String(row.milestone_id), documents);
  }
  const milestonesByProject = new Map();
  for (const row of milestoneRows) {
    const milestones = milestonesByProject.get(String(row.project_id)) || [];
    milestones.push({
      stage: row.stage_name,
      estimatedDate: dbDate(row.estimated_date),
      completionDate: dbDate(row.completion_date),
      note: row.note || '',
      documents: documentsByMilestone.get(String(row.id)) || [],
    });
    milestonesByProject.set(String(row.project_id), milestones);
  }
  return projects.map((project) => ({ ...project, milestones: milestonesByProject.get(project.id) || [] }));
}

function projectFromRow(row) {
  return {
    ...row,
    id: String(row.id),
    progress: Number(row.progress),
    proposedArea: Number(row.proposed_area),
    acquiredArea: Number(row.acquired_area),
    compensationAssessed: Number(row.compensation_assessed),
    compensationPaid: Number(row.compensation_paid),
    affectedFamilies: Number(row.affected_families),
    displacedFamilies: Number(row.displaced_families),
    rrProgress: Number(row.rr_progress),
    daysInStage: Number(row.days_in_stage),
    deadlineDays: Number(row.deadline_days),
    updatedAt: new Date(row.updated_at).toISOString(),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

export async function listProjects() {
  if (!pool) return demoProjects;
  const [rows] = await pool.query('SELECT * FROM projects ORDER BY updated_at DESC');
  return attachMilestones(rows.map(projectFromRow));
}

export async function createProject(input) {
  const project = {
    id: `demo-${Date.now()}`,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    state: input.state.trim(),
    district: input.district.trim(),
    agency: input.agency.trim(),
    stage: lifecycleStages[0],
    progress: 5,
    proposedArea: Number(input.proposedArea),
    acquiredArea: 0,
    compensationAssessed: 0,
    compensationPaid: 0,
    affectedFamilies: 0,
    displacedFamilies: 0,
    rrProgress: 0,
    possessionStatus: 'Not started',
    daysInStage: 0,
    deadlineDays: 30,
    updatedAt: new Date().toISOString(),
    latitude: 22.8,
    longitude: 79.0,
    milestones: createMilestones(lifecycleStages[0]),
  };

  if (!pool) {
    demoProjects = [project, ...demoProjects];
    await persistDemoProjects();
    return project;
  }

  const [result] = await pool.execute(
    `INSERT INTO projects
      (code, name, state, district, agency, stage, progress, proposed_area, acquired_area,
       compensation_assessed, compensation_paid, affected_families, displaced_families,
       rr_progress, possession_status, days_in_stage, deadline_days, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, 0, 30, ?, ?)`,
    [project.code, project.name, project.state, project.district, project.agency, project.stage, project.progress, project.proposedArea, project.possessionStatus, project.latitude, project.longitude],
  );
  const [rows] = await pool.execute('SELECT * FROM projects WHERE id = ?', [result.insertId]);
  const created = projectFromRow(rows[0]);
  await ensureMilestones(created.id, created.stage);
  return (await attachMilestones([created]))[0];
}

export async function updateProjectStage(id, stage) {
  const stageIndex = lifecycleStages.indexOf(stage);
  if (stageIndex < 0) throw new Error('Unknown lifecycle stage.');

  if (!pool) {
    const project = demoProjects.find((item) => item.id === id);
    if (!project) throw new Error('Project not found.');
    project.stage = stage;
    project.progress = Math.round((stageIndex / (lifecycleStages.length - 1)) * 100);
    project.daysInStage = 0;
    project.updatedAt = new Date().toISOString();
    const today = new Date();
    const completionDate = today.toISOString().slice(0, 10);
    for (const milestone of project.milestones) {
      const milestoneIndex = lifecycleStages.indexOf(milestone.stage);
      if (milestoneIndex < stageIndex) {
        milestone.completionDate ||= completionDate;
        milestone.estimatedDate = null;
      } else if (milestoneIndex === stageIndex && !milestone.completionDate && !milestone.estimatedDate) {
        today.setUTCDate(today.getUTCDate() + 14);
        milestone.estimatedDate = today.toISOString().slice(0, 10);
      }
    }
    await persistDemoProjects();
    return project;
  }

  const [existing] = await pool.execute('SELECT stage FROM projects WHERE id = ?', [id]);
  if (!existing.length) throw new Error('Project not found.');
  await ensureMilestones(id, existing[0].stage);
  const [result] = await pool.execute(
    'UPDATE projects SET stage = ?, progress = ?, days_in_stage = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [stage, Math.round((stageIndex / (lifecycleStages.length - 1)) * 100), id],
  );
  if (!result.affectedRows) throw new Error('Project not found.');
  const priorStages = lifecycleStages.slice(0, stageIndex);
  if (priorStages.length) {
    await pool.execute(
      'UPDATE project_milestones SET completion_date = COALESCE(completion_date, CURRENT_DATE), estimated_date = NULL WHERE project_id = ? AND stage_name IN (?)',
      [id, priorStages],
    );
  }
  await pool.execute(
    `UPDATE project_milestones SET estimated_date = COALESCE(estimated_date, DATE_ADD(CURRENT_DATE, INTERVAL 14 DAY))
     WHERE project_id = ? AND stage_name = ? AND completion_date IS NULL`,
    [id, stage],
  );
  const [rows] = await pool.execute('SELECT * FROM projects WHERE id = ?', [id]);
  return (await attachMilestones([projectFromRow(rows[0])]))[0];
}

export async function updateProjectMilestone(projectId, update) {
  if (!lifecycleStages.includes(update.stage)) throw new Error('Unknown lifecycle milestone.');
  if (update.completionDate && update.estimatedDate) throw new Error('A milestone cannot have both dates.');
  for (const date of [update.completionDate, update.estimatedDate]) {
    if (!date) continue;
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error('Enter a valid milestone date.');
  }
  if (update.note.length > 2000) throw new Error('Milestone notes must be 2,000 characters or fewer.');

  if (!pool) {
    const project = demoProjects.find((item) => item.id === String(projectId));
    if (!project) throw new Error('Project not found.');
    const milestone = project.milestones.find((item) => item.stage === update.stage);
    if (!milestone) throw new Error('Milestone not found.');
    milestone.completionDate = update.completionDate || null;
    milestone.estimatedDate = update.estimatedDate || null;
    milestone.note = update.note.trim();
    project.updatedAt = new Date().toISOString();
    await persistDemoProjects();
    return project;
  }

  const [projects] = await pool.execute('SELECT id, stage FROM projects WHERE id = ?', [projectId]);
  if (!projects.length) throw new Error('Project not found.');
  await ensureMilestones(projectId, projects[0].stage);
  await pool.execute(
    `UPDATE project_milestones SET estimated_date = ?, completion_date = ?, note = ?
     WHERE project_id = ? AND stage_name = ?`,
    [update.estimatedDate || null, update.completionDate || null, update.note.trim(), projectId, update.stage],
  );
  const [rows] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId]);
  return (await attachMilestones([projectFromRow(rows[0])]))[0];
}

export async function addMilestoneDocument(projectId, stage, document) {
  if (!lifecycleStages.includes(stage)) throw new Error('Unknown lifecycle milestone.');
  const metadata = {
    id: document.id,
    fileName: document.fileName,
    mediaType: document.mediaType,
    fileSize: document.fileSize,
    uploadedBy: document.uploadedBy,
    uploadedAt: document.uploadedAt,
    url: `/api/documents/${document.id}`,
    storageName: document.storageName,
  };

  if (!pool) {
    const project = demoProjects.find((item) => item.id === String(projectId));
    if (!project) throw new Error('Project not found.');
    const milestone = project.milestones.find((item) => item.stage === stage);
    if (!milestone) throw new Error('Milestone not found.');
    milestone.documents.unshift(metadata);
    await persistDemoProjects();
    return { ...metadata, storageName: undefined };
  }

  await ensureMilestones(projectId, lifecycleStages[0]);
  const [result] = await pool.execute('SELECT id FROM project_milestones WHERE project_id = ? AND stage_name = ?', [projectId, stage]);
  if (!result.length) throw new Error('Milestone not found.');
  await pool.execute(
    `INSERT INTO milestone_documents (id, milestone_id, file_name, storage_name, media_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [metadata.id, result[0].id, metadata.fileName, metadata.storageName, metadata.mediaType, metadata.fileSize, metadata.uploadedBy],
  );
  return { ...metadata, storageName: undefined };
}

export async function findMilestoneDocument(id) {
  if (!pool) {
    for (const project of demoProjects) {
      for (const milestone of project.milestones) {
        const document = milestone.documents.find((item) => item.id === id);
        if (document) return document;
      }
    }
    return null;
  }
  const [rows] = await pool.execute('SELECT * FROM milestone_documents WHERE id = ?', [id]);
  return rows.length ? mapMilestoneDocuments(rows)[0] : null;
}