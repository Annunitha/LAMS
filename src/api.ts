export type Project = {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
  agency: string;
  stage: string;
  progress: number;
  proposedArea: number;
  acquiredArea: number;
  compensationAssessed: number;
  compensationPaid: number;
  affectedFamilies: number;
  displacedFamilies: number;
  rrProgress: number;
  possessionStatus: string;
  daysInStage: number;
  deadlineDays: number;
  updatedAt: string;
  latitude: number;
  longitude: number;
  risk: 'On track' | 'Watch' | 'Critical';
  milestones: Milestone[];
};

export type MilestoneDocument = {
  id: string;
  fileName: string;
  mediaType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
};

export type Milestone = {
  stage: string;
  estimatedDate: string | null;
  completionDate: string | null;
  note: string;
  documents: MilestoneDocument[];
};

export type ProjectInput = Pick<Project, 'code' | 'name' | 'state' | 'district' | 'agency' | 'proposedArea'>;

const projectFields = `id code name state district agency stage progress proposedArea acquiredArea
  compensationAssessed compensationPaid affectedFamilies displacedFamilies rrProgress possessionStatus
  daysInStage deadlineDays updatedAt latitude longitude risk
  milestones { stage estimatedDate completionDate note documents { id fileName mediaType fileSize uploadedBy uploadedAt url } }`;

export async function graphQL<T>(query: string, role: string): Promise<T> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-role': role },
    body: JSON.stringify({ query }),
  });
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors[0].message);
  return result.data as T;
}

export async function uploadMilestoneDocument(projectId: string, stageIndex: number, file: File, role: string): Promise<MilestoneDocument> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/milestones/${stageIndex}/documents`, {
    method: 'POST',
    headers: { 'x-user-role': role },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Document upload failed.');
  return result.document as MilestoneDocument;
}

export const queries = {
  projects: `query { projects { ${projectFields} } }`,
  createProject: (input: ProjectInput) => `mutation {
    createProject(input: {
      code: ${JSON.stringify(input.code)}
      name: ${JSON.stringify(input.name)}
      state: ${JSON.stringify(input.state)}
      district: ${JSON.stringify(input.district)}
      agency: ${JSON.stringify(input.agency)}
      proposedArea: ${input.proposedArea}
    }) { ${projectFields} }
  }`,
  updateStage: (id: string, stage: string) => `mutation {
    updateProjectStage(id: ${JSON.stringify(id)}, stage: ${JSON.stringify(stage)}) { ${projectFields} }
  }`,
  updateMilestone: (projectId: string, stage: string, estimatedDate: string, completionDate: string, note: string) => `mutation {
    updateProjectMilestone(input: {
      projectId: ${JSON.stringify(projectId)}
      stage: ${JSON.stringify(stage)}
      estimatedDate: ${estimatedDate ? JSON.stringify(estimatedDate) : 'null'}
      completionDate: ${completionDate ? JSON.stringify(completionDate) : 'null'}
      note: ${JSON.stringify(note)}
    }) { ${projectFields} }
  }`,
};