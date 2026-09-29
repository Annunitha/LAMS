export const lifecycleStages = [
  'Proposal submitted',
  'District scrutiny',
  'State approval',
  'Notification issued',
  'Award declared',
  'Compensation disbursed',
  'Possession',
  'Closed',
];

export function createMilestones(currentStage) {
  const currentIndex = Math.max(0, lifecycleStages.indexOf(currentStage));
  const baseline = new Date('2026-09-29T00:00:00Z');
  return lifecycleStages.map((stage, index) => {
    const date = new Date(baseline);
    if (index < currentIndex) {
      date.setUTCDate(date.getUTCDate() - (currentIndex - index) * 17);
    } else {
      date.setUTCDate(date.getUTCDate() + (index - currentIndex + 1) * 14);
    }
    return {
      stage,
      completionDate: index < currentIndex ? date.toISOString().slice(0, 10) : null,
      estimatedDate: index < currentIndex ? null : date.toISOString().slice(0, 10),
      note: '',
      documents: [],
    };
  });
}

const seededProjects = [
  {
    id: '1', code: 'LA-RAJ-0261', name: 'Delhi–Mumbai Expressway, Package 14', state: 'Rajasthan', district: 'Alwar', agency: 'NHAI', stage: 'Compensation disbursed', progress: 78, proposedArea: 428.6, acquiredArea: 366.2, compensationAssessed: 184.2, compensationPaid: 151.4, affectedFamilies: 842, displacedFamilies: 118, rrProgress: 68, possessionStatus: 'Partial', daysInStage: 18, deadlineDays: 12, updatedAt: '2026-09-29T09:42:00Z', latitude: 27.553, longitude: 76.634,
  },
  {
    id: '2', code: 'LA-MH-0148', name: 'Pune Ring Road, Eastern Link', state: 'Maharashtra', district: 'Pune', agency: 'MSRDC', stage: 'District scrutiny', progress: 24, proposedArea: 312.8, acquiredArea: 74.5, compensationAssessed: 98.5, compensationPaid: 21.3, affectedFamilies: 634, displacedFamilies: 86, rrProgress: 14, possessionStatus: 'Not started', daysInStage: 29, deadlineDays: 4, updatedAt: '2026-09-28T15:10:00Z', latitude: 18.520, longitude: 73.856,
  },
  {
    id: '3', code: 'LA-UP-0397', name: 'Ganga Expressway, Sector 8', state: 'Uttar Pradesh', district: 'Hardoi', agency: 'UPEIDA', stage: 'Award declared', progress: 63, proposedArea: 526.4, acquiredArea: 331.2, compensationAssessed: 226.8, compensationPaid: 136.2, affectedFamilies: 1108, displacedFamilies: 204, rrProgress: 53, possessionStatus: 'Partial', daysInStage: 8, deadlineDays: 19, updatedAt: '2026-09-29T08:17:00Z', latitude: 27.394, longitude: 80.131,
  },
  {
    id: '4', code: 'LA-TN-0206', name: 'Chennai–Bengaluru Industrial Corridor', state: 'Tamil Nadu', district: 'Krishnagiri', agency: 'TIDCO', stage: 'State approval', progress: 39, proposedArea: 284.1, acquiredArea: 110.8, compensationAssessed: 74.6, compensationPaid: 18.8, affectedFamilies: 492, displacedFamilies: 73, rrProgress: 21, possessionStatus: 'Not started', daysInStage: 11, deadlineDays: 16, updatedAt: '2026-09-27T11:32:00Z', latitude: 12.518, longitude: 78.214,
  },
  {
    id: '5', code: 'LA-OD-0082', name: 'Subarnarekha Irrigation Extension', state: 'Odisha', district: 'Balasore', agency: 'DoWR Odisha', stage: 'Notification issued', progress: 48, proposedArea: 198.7, acquiredArea: 95.3, compensationAssessed: 42.1, compensationPaid: 17.5, affectedFamilies: 376, displacedFamilies: 142, rrProgress: 32, possessionStatus: 'Not started', daysInStage: 6, deadlineDays: 24, updatedAt: '2026-09-26T13:06:00Z', latitude: 21.494, longitude: 86.933,
  },
  {
    id: '6', code: 'LA-GJ-0173', name: 'Dholera Greenfield Airport Link', state: 'Gujarat', district: 'Ahmedabad', agency: 'G-RIDE', stage: 'Proposal submitted', progress: 11, proposedArea: 355.2, acquiredArea: 29.4, compensationAssessed: 0, compensationPaid: 0, affectedFamilies: 714, displacedFamilies: 95, rrProgress: 0, possessionStatus: 'Not started', daysInStage: 3, deadlineDays: 30, updatedAt: '2026-09-29T07:54:00Z', latitude: 22.999, longitude: 72.150,
  },
];

export const seedProjects = seededProjects.map((project) => ({
  ...project,
  milestones: createMilestones(project.stage),
}));