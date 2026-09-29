import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';
import { GraphQLError } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { addMilestoneDocument, createProject, findMilestoneDocument, listProjects, updateProjectMilestone, updateProjectStage } from './repository.js';
import { lifecycleStages } from './seed.js';

const uploadsDirectory = fileURLToPath(new URL('../uploads/', import.meta.url));
await mkdir(uploadsDirectory, { recursive: true });

const canManageRecords = (role) => ['Project Agency', 'District Authority', 'State Authority', 'Ministry'].includes(role);

function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(data));
}

function parseDocumentUpload(request) {
  return new Promise((resolve, reject) => {
    let document = null;
    let uploadError = null;
    let fileCount = 0;
    let parser;
    try {
      parser = Busboy({ headers: request.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 0 } });
    } catch {
      reject(new Error('Expected a multipart PDF or text file upload.'));
      return;
    }
    parser.on('file', (field, stream, info) => {
      fileCount += 1;
      const extension = path.extname(info.filename).toLowerCase();
      const mediaType = extension === '.pdf' && info.mimeType === 'application/pdf'
        ? 'application/pdf'
        : extension === '.txt' && info.mimeType === 'text/plain'
          ? 'text/plain'
          : null;
      if (field !== 'file' || !mediaType) {
        uploadError = new Error('Only PDF and plain-text (.txt) attachments are allowed.');
        stream.resume();
        return;
      }
      const chunks = [];
      let fileSize = 0;
      stream.on('data', (chunk) => { chunks.push(chunk); fileSize += chunk.length; });
      stream.on('limit', () => { uploadError = new Error('Attachments must be 10 MB or smaller.'); });
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (mediaType === 'application/pdf' && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          uploadError = new Error('The selected file does not contain a valid PDF header.');
          return;
        }
        if (mediaType === 'text/plain' && buffer.includes(0)) {
          uploadError = new Error('Text attachments must not contain binary data.');
          return;
        }
        const fileName = path.basename(info.filename).replace(/[\\/\u0000-\u001f]/g, '').slice(0, 255);
        document = { fileName, mediaType, fileSize, buffer };
      });
    });
    parser.on('filesLimit', () => { uploadError = new Error('Upload one attachment at a time.'); });
    parser.on('error', reject);
    parser.on('finish', () => {
      if (uploadError) reject(uploadError);
      else if (fileCount !== 1 || !document) reject(new Error('Choose a PDF or text attachment.'));
      else resolve(document);
    });
    request.pipe(parser);
  });
}

async function handleDocumentRequest(request, response) {
  const uploadMatch = request.url.match(/^\/api\/projects\/([^/]+)\/milestones\/(\d+)\/documents$/);
  if (request.method === 'POST' && uploadMatch) {
    const role = request.headers['x-user-role'] || 'Public Viewer';
    if (!canManageRecords(role)) return sendJson(response, 403, { error: 'This role cannot add milestone records.' });
    const stage = lifecycleStages[Number(uploadMatch[2])];
    if (!stage) return sendJson(response, 400, { error: 'Unknown lifecycle milestone.' });

    let storedPath;
    try {
      const upload = await parseDocumentUpload(request);
      const id = randomUUID();
      const storageName = `${id}${path.extname(upload.fileName).toLowerCase()}`;
      storedPath = path.join(uploadsDirectory, storageName);
      await writeFile(storedPath, upload.buffer, { flag: 'wx' });
      const document = await addMilestoneDocument(decodeURIComponent(uploadMatch[1]), stage, {
        id,
        storageName,
        fileName: upload.fileName,
        mediaType: upload.mediaType,
        fileSize: upload.fileSize,
        uploadedBy: role,
        uploadedAt: new Date().toISOString(),
      });
      return sendJson(response, 201, { document });
    } catch (error) {
      if (storedPath) await rm(storedPath, { force: true });
      const status = error.message.includes('not found') ? 404 : 400;
      return sendJson(response, status, { error: error.message || 'Document upload failed.' });
    }
  }

  const documentMatch = request.url.match(/^\/api\/documents\/([a-f\d-]{36})$/i);
  if (request.method === 'GET' && documentMatch) {
    try {
      const document = await findMilestoneDocument(documentMatch[1]);
      if (!document) return sendJson(response, 404, { error: 'Document not found.' });
      const contents = await readFile(path.join(uploadsDirectory, document.storageName));
      response.writeHead(200, {
        'content-type': document.mediaType,
        'content-length': contents.length,
        'content-disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
        'x-content-type-options': 'nosniff',
      });
      return response.end(contents);
    } catch {
      return sendJson(response, 404, { error: 'Document not found.' });
    }
  }

  sendJson(response, 404, { error: 'Endpoint not found.' });
}

const typeDefs = /* GraphQL */ `
  type Project {
    id: ID!
    code: String!
    name: String!
    state: String!
    district: String!
    agency: String!
    stage: String!
    progress: Int!
    proposedArea: Float!
    acquiredArea: Float!
    compensationAssessed: Float!
    compensationPaid: Float!
    affectedFamilies: Int!
    displacedFamilies: Int!
    rrProgress: Int!
    possessionStatus: String!
    daysInStage: Int!
    deadlineDays: Int!
    updatedAt: String!
    latitude: Float!
    longitude: Float!
    risk: String!
    milestones: [Milestone!]!
  }

  type MilestoneDocument {
    id: ID!
    fileName: String!
    mediaType: String!
    fileSize: Int!
    uploadedBy: String!
    uploadedAt: String!
    url: String!
  }

  type Milestone {
    stage: String!
    estimatedDate: String
    completionDate: String
    note: String!
    documents: [MilestoneDocument!]!
  }

  input ProjectInput {
    code: String!
    name: String!
    state: String!
    district: String!
    agency: String!
    proposedArea: Float!
  }

  input MilestoneInput {
    projectId: ID!
    stage: String!
    estimatedDate: String
    completionDate: String
    note: String!
  }

  type Query {
    projects: [Project!]!
  }

  type Mutation {
    createProject(input: ProjectInput!): Project!
    updateProjectStage(id: ID!, stage: String!): Project!
    updateProjectMilestone(input: MilestoneInput!): Project!
  }
`;

const resolvers = {
  Query: { projects: () => listProjects() },
  Project: {
    risk: (project) => {
      if (project.daysInStage > project.deadlineDays) return 'Critical';
      if (project.deadlineDays - project.daysInStage <= 7) return 'Watch';
      return 'On track';
    },
  },
  Mutation: {
    createProject: (_root, { input }, { role }) => {
      if (!['Project Agency', 'Ministry'].includes(role)) throw new GraphQLError('This role cannot submit proposals.', { extensions: { code: 'FORBIDDEN' } });
      return createProject(input);
    },
    updateProjectStage: (_root, { id, stage }, { role }) => {
      if (!['District Authority', 'State Authority', 'Ministry'].includes(role)) throw new GraphQLError('This role cannot update lifecycle stages.', { extensions: { code: 'FORBIDDEN' } });
      return updateProjectStage(id, stage);
    },
    updateProjectMilestone: async (_root, { input }, { role }) => {
      if (!canManageRecords(role)) throw new GraphQLError('This role cannot update milestone records.', { extensions: { code: 'FORBIDDEN' } });
      try {
        return await updateProjectMilestone(input.projectId, input);
      } catch (error) {
        throw new GraphQLError(error.message, { extensions: { code: 'BAD_USER_INPUT' } });
      }
    },
  },
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: '/graphql',
  context: ({ request }) => ({ role: request.headers.get('x-user-role') || 'Public Viewer' }),
});

const port = Number(process.env.PORT || 4000);
createServer((request, response) => {
  if (request.url.startsWith('/api/')) {
    void handleDocumentRequest(request, response);
    return;
  }
  void yoga(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Land acquisition GraphQL API ready at http://localhost:${port}/graphql`);
});