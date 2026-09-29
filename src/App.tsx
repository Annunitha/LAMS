import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import L from 'leaflet';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check,
  ChevronDown, CircleHelp, ClipboardList, Download, FilePlus2, FileText, Filter,
  Gauge, Landmark, Layers3, MapPinned, Menu, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import { graphQL, queries, uploadMilestoneDocument, type MilestoneDocument, type Project, type ProjectInput } from './api';
import { indiaOutline } from './map-data';

type Page = 'Overview' | 'Projects' | 'Spatial view' | 'Reports';
type Role = 'Public Viewer' | 'Project Agency' | 'District Authority' | 'State Authority' | 'Ministry';

const lifecycle = ['Proposal submitted', 'District scrutiny', 'State approval', 'Notification issued', 'Award declared', 'Compensation disbursed', 'Possession', 'Closed'];
const roles: Role[] = ['Public Viewer', 'Project Agency', 'District Authority', 'State Authority', 'Ministry'];
const navItems: { page: Page; icon: typeof Gauge }[] = [
  { page: 'Overview', icon: Gauge },
  { page: 'Projects', icon: ClipboardList },
  { page: 'Spatial view', icon: MapPinned },
  { page: 'Reports', icon: FileText },
];

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded';
}

function formatFileSize(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function stageClass(stage: string) {
  if (stage === 'Closed' || stage === 'Possession') return 'complete';
  if (stage === 'District scrutiny' || stage === 'State approval') return 'review';
  if (stage === 'Proposal submitted') return 'submitted';
  return 'active';
}

function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [role, setRole] = useState<Role>('Ministry');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('All states');
  const [selected, setSelected] = useState<Project | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await graphQL<{ projects: Project[] }>(queries.projects, role);
      setProjects(data.projects);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load project records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [role]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredProjects = projects.filter((project) => {
    const search = query.trim().toLowerCase();
    const matchesSearch = !search || `${project.code} ${project.name} ${project.district} ${project.state} ${project.agency}`.toLowerCase().includes(search);
    const matchesState = stateFilter === 'All states' || project.state === stateFilter;
    return matchesSearch && matchesState;
  });
  const acquired = projects.reduce((sum, project) => sum + project.acquiredArea, 0);
  const proposed = projects.reduce((sum, project) => sum + project.proposedArea, 0);
  const paid = projects.reduce((sum, project) => sum + project.compensationPaid, 0);
  const assessed = projects.reduce((sum, project) => sum + project.compensationAssessed, 0);
  const families = projects.reduce((sum, project) => sum + project.affectedFamilies, 0);
  const riskProjects = projects.filter((project) => project.risk !== 'On track').sort((a, b) => b.daysInStage - a.daysInStage);

  async function createProject(input: ProjectInput) {
    try {
      const data = await graphQL<{ createProject: Project }>(queries.createProject(input), role);
      setProjects((current) => [data.createProject, ...current]);
      setCreateOpen(false);
      setPage('Projects');
      setNotice(`Proposal ${data.createProject.code} added to the workflow.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Proposal could not be submitted.');
    }
  }

  async function updateStage(project: Project, stage: string) {
    try {
      const data = await graphQL<{ updateProjectStage: Project }>(queries.updateStage(project.id, stage), role);
      setProjects((current) => current.map((item) => item.id === project.id ? data.updateProjectStage : item));
      setSelected(data.updateProjectStage);
      setNotice(`${project.code} moved to ${stage}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stage update failed.');
    }
  }

  async function updateMilestone(project: Project, stage: string, estimatedDate: string, completionDate: string, note: string) {
    const data = await graphQL<{ updateProjectMilestone: Project }>(queries.updateMilestone(project.id, stage, estimatedDate, completionDate, note), role);
    setProjects((current) => current.map((item) => item.id === project.id ? data.updateProjectMilestone : item));
    setSelected(data.updateProjectMilestone);
    setNotice(`${stage} milestone details saved.`);
  }

  async function addMilestoneDocument(project: Project, stage: string, stageIndex: number, file: File): Promise<MilestoneDocument> {
    const document = await uploadMilestoneDocument(project.id, stageIndex, file, role);
    const updateDocuments = (item: Project): Project => ({
      ...item,
      milestones: item.milestones.map((milestone) => milestone.stage === stage
        ? { ...milestone, documents: [document, ...milestone.documents] }
        : milestone),
    });
    setProjects((current) => current.map((item) => item.id === project.id ? updateDocuments(item) : item));
    setSelected((current) => current?.id === project.id ? updateDocuments(current) : current);
    setNotice('Milestone attachment uploaded.');
    return document;
  }

  function exportReport() {
    const rows = [
      ['Project ID', 'Project', 'State', 'District', 'Stage', 'Progress %', 'Area proposed (ha)', 'Area acquired (ha)', 'Compensation assessed (Cr)', 'Compensation paid (Cr)', 'Affected families', 'R&R progress %', 'Possession', 'Delay risk'],
      ...filteredProjects.map((project) => [project.code, project.name, project.state, project.district, project.stage, project.progress, project.proposedArea, project.acquiredArea, project.compensationAssessed, project.compensationPaid, project.affectedFamilies, project.rrProgress, project.possessionStatus, project.risk]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'national-land-acquisition-progress.csv';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Progress report downloaded.');
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    setMobileMenu(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={() => navigate('Overview')}>
          <span className="brand-mark"><Landmark size={20} strokeWidth={1.8} /></span>
          <span className="brand-name">Bhoomi<span>Setu</span></span>
        </a>
        <div className="sidebar-label">NATIONAL CONTROL ROOM</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map(({ page: item, icon: Icon }) => (
            <button className={`nav-link ${page === item ? 'nav-active' : ''}`} key={item} onClick={() => navigate(item)}>
              <Icon size={17} strokeWidth={1.8} /><span>{item}</span>
              {item === 'Projects' && <span className="nav-count">{projects.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-live"><span className="live-dot" /><span>System operational</span></div>
          <div className="sidebar-footer"><ShieldCheck size={15} /><span>Secure governance network</span></div>
          <span className="version-label">PROTOTYPE 0.1 · SIH 2026</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Land Acquisition</span><span className="breadcrumb-separator">/</span><strong>{page}</strong></div>
          <div className="topbar-actions">
            <div className="live-status"><span className="live-dot" />Live data</div>
            <label className="role-select"><span>View as</span><select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Demo user role">{roles.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label>
            <button className="icon-button notification-button" aria-label={`${riskProjects.length} pending alerts`} onClick={() => navigate('Overview')}><Bell size={18} /><span className="notification-dot" /></button>
            <div className="user-avatar" title={role}>{role === 'Ministry' ? 'MO' : role.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
          </div>
        </header>

        <main className="content-area">
          {error && <div className="error-banner"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => { setError(''); void refresh(); }}>Retry</button></div>}
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />MINISTRY OF RURAL DEVELOPMENT <span className="heading-dot">·</span> LAND ACQUISITION</div>
              <h1>{page === 'Overview' ? 'National overview' : page}</h1>
              <p>{page === 'Overview' ? 'A live view of acquisition progress, obligations and delivery across India.' : page === 'Projects' ? 'Track proposals, statutory milestones and field-level progress.' : page === 'Spatial view' ? 'Explore project locations and their acquisition footprint.' : 'Prepare a consolidated progress report for decision-makers.'}</p>
            </div>
            <div className="heading-actions">
              <span className="updated-note"><Activity size={14} />Updated just now</span>
              {(role === 'Project Agency' || role === 'Ministry') && <button className="primary-button" onClick={() => setCreateOpen(true)}><FilePlus2 size={16} />New proposal</button>}
            </div>
          </div>

          {loading && projects.length === 0 ? <div className="loading-state"><span className="loading-spinner" />Loading national project register…</div> : <>
            {page === 'Overview' && <Overview projects={projects} riskProjects={riskProjects} acquired={acquired} proposed={proposed} paid={paid} assessed={assessed} families={families} onSelect={setSelected} onNavigate={navigate} />}
            {page === 'Projects' && <ProjectsPage projects={filteredProjects} query={query} stateFilter={stateFilter} states={[...new Set(projects.map((project) => project.state))].sort()} onQuery={setQuery} onState={setStateFilter} onSelect={setSelected} />}
            {page === 'Spatial view' && <div className="panel map-page-panel"><div className="panel-heading"><div><span className="section-kicker">GEOGRAPHIC MONITOR</span><h2>Project locations</h2></div><span className="map-total"><MapPinned size={15} />{projects.length} mapped projects</span></div><MapView projects={projects} onSelect={setSelected} expanded /></div>}
            {page === 'Reports' && <ReportsPage projects={filteredProjects} acquired={acquired} proposed={proposed} assessed={assessed} paid={paid} families={families} riskCount={riskProjects.length} onExport={exportReport} />}
          </>}
          <footer className="page-footer"><span>National Land Acquisition & Management System</span><span>Data shown is illustrative · SIH 2026 prototype</span></footer>
        </main>
      </div>

      {selected && <ProjectDrawer project={selected} role={role} onClose={() => setSelected(null)} onStage={updateStage} onMilestone={updateMilestone} onUpload={addMilestoneDocument} />}
      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} onSubmit={createProject} />}
      {notice && <div className="toast"><span className="toast-check"><Check size={14} /></span>{notice}</div>}
    </div>
  );
}

function Overview({ projects, riskProjects, acquired, proposed, paid, assessed, families, onSelect, onNavigate }: {
  projects: Project[]; riskProjects: Project[]; acquired: number; proposed: number; paid: number; assessed: number;
  families: number; onSelect: (project: Project) => void; onNavigate: (page: Page) => void;
}) {
  const stages = lifecycle.slice(0, 7).map((stage) => ({ stage, count: projects.filter((project) => project.stage === stage).length }));
  const maxStage = Math.max(1, ...stages.map(({ count }) => count));
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  return <>
    <section className="kpi-grid" aria-label="National acquisition indicators">
      <Kpi icon={Layers3} label="Active projects" value={formatNumber(projects.length)} unit="projects" change="Across 6 states & UTs" trend="neutral" tone="green" />
      <Kpi icon={MapPinned} label="Land acquired" value={formatNumber(acquired, 1)} unit="ha" change={`${formatNumber(proposed ? acquired / proposed * 100 : 0)}% of proposed area`} trend="up" tone="blue" />
      <Kpi icon={Landmark} label="Compensation paid" value={`₹${formatNumber(paid, 1)}`} unit="Cr" change={`₹${formatNumber(Math.max(assessed - paid, 0), 1)} Cr assessed balance`} trend="up" tone="amber" />
      <Kpi icon={Users} label="Affected families" value={formatNumber(families)} unit="families" change={`${formatNumber(projects.reduce((sum, item) => sum + item.displacedFamilies, 0))} displaced`} trend="neutral" tone="rose" />
    </section>

    <section className="insight-grid">
      <div className="panel stage-panel">
        <div className="panel-heading"><div><span className="section-kicker">LIFECYCLE DISTRIBUTION</span><h2>Where projects stand</h2></div><button className="text-button" onClick={() => onNavigate('Projects')}>All projects <ArrowRight size={14} /></button></div>
        <div className="stage-chart">
          {stages.map(({ stage, count }, index) => <div className="stage-row" key={stage}>
            <span className="stage-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stage-name">{stage}</span>
            <div className="stage-track"><span className={`stage-fill fill-${stageClass(stage)}`} style={{ width: `${count ? Math.max(count / maxStage * 100, 12) : 0}%` }} /></div>
            <strong className="stage-count">{String(count).padStart(2, '0')}</strong>
          </div>)}
        </div>
        <div className="stage-footnote"><span><span className="legend-dot legend-active" />Active stage</span><span>{projects.length} total records</span></div>
      </div>
      <div className="panel alerts-panel">
        <div className="panel-heading"><div><span className="section-kicker">ATTENTION REQUIRED</span><h2>Delay watch</h2></div><span className="alert-count">{riskProjects.length} cases</span></div>
        {riskProjects.length === 0 ? <div className="empty-inline"><Check size={17} />No delayed cases in the current register.</div> : <div className="alert-list">
          {riskProjects.slice(0, 3).map((project) => <button className="alert-item" key={project.id} onClick={() => onSelect(project)}>
            <span className={`alert-icon ${project.risk === 'Critical' ? 'alert-critical' : 'alert-watch'}`}><AlertTriangle size={15} /></span>
            <span className="alert-copy"><strong>{project.name}</strong><small>{project.code} <span>·</span> {project.stage}</small></span>
            <span className="alert-days">{project.daysInStage > project.deadlineDays ? `${project.daysInStage - project.deadlineDays}d late` : `${project.deadlineDays - project.daysInStage}d left`}</span>
          </button>)}
        </div>}
        <div className="alert-foot"><Activity size={14} />Rule-based SLA monitoring <CircleHelp size={13} className="help-icon" /></div>
      </div>
    </section>

    <section className="lower-grid">
      <div className="panel map-panel">
        <div className="panel-heading"><div><span className="section-kicker">GIS MONITOR</span><h2>Acquisition footprint</h2></div><button className="icon-button subtle-button" aria-label="Open spatial view" onClick={() => onNavigate('Spatial view')}><ArrowRight size={17} /></button></div>
        <MapView projects={projects} onSelect={onSelect} />
        <div className="map-legend"><span><i className="map-pin acquired-pin" />Land acquired</span><span><i className="map-pin in-progress-pin" />In progress</span><button className="text-button" onClick={() => onNavigate('Spatial view')}>Open GIS view <ArrowRight size={13} /></button></div>
      </div>
      <div className="panel recent-panel">
        <div className="panel-heading"><div><span className="section-kicker">LATEST ACTIVITY</span><h2>Recently updated</h2></div><button className="text-button" onClick={() => onNavigate('Projects')}>Register <ArrowRight size={14} /></button></div>
        <div className="recent-list">
          {recent.map((project) => <button className="recent-row" key={project.id} onClick={() => onSelect(project)}>
            <span className={`recent-symbol ${stageClass(project.stage)}`}><Landmark size={15} /></span>
            <span className="recent-info"><strong>{project.name}</strong><small>{project.district}, {project.state}</small></span>
            <span className={`stage-pill ${stageClass(project.stage)}`}>{project.stage}</span>
          </button>)}
        </div>
        <div className="recent-summary"><span>Across <strong>{new Set(projects.map((project) => project.state)).size} states</strong></span><span><strong>{formatNumber(proposed - acquired, 1)} ha</strong> pending</span></div>
      </div>
    </section>
  </>;
}

function Kpi({ icon: Icon, label, value, unit, change, trend, tone }: {
  icon: typeof Gauge; label: string; value: string; unit: string; change: string; trend: 'up' | 'down' | 'neutral'; tone: string;
}) {
  return <article className="kpi-card">
    <div className="kpi-top"><span className={`kpi-icon ${tone}`}><Icon size={17} strokeWidth={1.8} /></span><span className="kpi-label">{label}</span><button className="kpi-more" title={`${label} information`}><CircleHelp size={14} /></button></div>
    <div className="kpi-value">{value}<small>{unit}</small></div>
    <div className={`kpi-change ${trend}`}>
      {trend === 'up' ? <ArrowUpRight size={13} /> : trend === 'down' ? <ArrowDownRight size={13} /> : <span className="neutral-mark">—</span>}{change}
    </div>
  </article>;
}

function MapView({ projects, onSelect, expanded = false }: { projects: Project[]; onSelect: (project: Project) => void; expanded?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: false }).setView([22.8, 79.4], 4.4);
    const geoserverUrl = import.meta.env.VITE_GEOSERVER_WMS;
    if (geoserverUrl) {
      L.tileLayer.wms(geoserverUrl, { layers: import.meta.env.VITE_GEOSERVER_LAYER || 'workspace:land_parcels', format: 'image/png', transparent: true }).addTo(instance);
    } else {
      L.polygon(indiaOutline, { color: '#718f78', weight: 1.5, fillColor: '#d8e2d5', fillOpacity: 0.72 }).addTo(instance);
    }
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    return () => { instance.remove(); map.current = null; markers.current = null; };
  }, []);

  useEffect(() => {
    if (!markers.current || !map.current) return;
    markers.current.clearLayers();
    const points: L.LatLng[] = [];
    projects.forEach((project) => {
      const point: L.LatLngExpression = [project.latitude, project.longitude];
      points.push(L.latLng(project.latitude, project.longitude));
      const marker = L.circleMarker(point, {
        radius: project.risk === 'Critical' ? 9 : 7,
        color: project.risk === 'Critical' ? '#a64032' : project.risk === 'Watch' ? '#c58125' : '#236a56',
        weight: 2,
        fillColor: project.risk === 'Critical' ? '#dc7667' : project.risk === 'Watch' ? '#e9b158' : '#68a78a',
        fillOpacity: 0.92,
      }).addTo(markers.current!);
      marker.bindTooltip(`<strong>${project.code}</strong><br>${project.district}, ${project.state}`, { direction: 'top', offset: [0, -7] });
      marker.on('click', () => onSelect(project));
    });
    if (expanded && points.length > 1) map.current.fitBounds(L.latLngBounds(points).pad(0.22), { animate: false });
  }, [projects, onSelect, expanded]);

  return <div ref={container} className={`leaflet-map ${expanded ? 'leaflet-expanded' : ''}`} aria-label="Interactive project location map" />;
}

function ProjectsPage({ projects, query, stateFilter, states, onQuery, onState, onSelect }: {
  projects: Project[]; query: string; stateFilter: string; states: string[]; onQuery: (value: string) => void;
  onState: (value: string) => void; onSelect: (project: Project) => void;
}) {
  return <section className="panel project-register">
    <div className="register-toolbar">
      <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search project, ID, district…" /><kbd>⌘ K</kbd></label>
      <label className="filter-select"><Filter size={15} /><select value={stateFilter} onChange={(event) => onState(event.target.value)}><option>All states</option>{states.map((state) => <option key={state}>{state}</option>)}</select><ChevronDown size={13} /></label>
      <span className="result-count">{projects.length} records</span>
    </div>
    <div className="table-scroll"><table className="project-table">
      <thead><tr><th>PROJECT / REFERENCE</th><th>STATE / DISTRICT</th><th>CURRENT STAGE</th><th>ACQUISITION</th><th>R&amp;R</th><th>DELAY RISK</th><th /></tr></thead>
      <tbody>{projects.map((project) => <tr key={project.id} onClick={() => onSelect(project)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(project); }}>
        <td><span className="table-project-name">{project.name}</span><span className="table-project-code">{project.code} <span>·</span> {project.agency}</span></td>
        <td><span className="table-place">{project.state}</span><span className="table-project-code">{project.district}</span></td>
        <td><span className={`stage-pill ${stageClass(project.stage)}`}>{project.stage}</span></td>
        <td><div className="table-progress-label">{formatNumber(project.progress)}% <small>{formatNumber(project.acquiredArea, 1)} / {formatNumber(project.proposedArea, 1)} ha</small></div><ProgressBar value={project.progress} /></td>
        <td><span className="rr-value">{project.rrProgress}%</span><span className="table-project-code">{formatNumber(project.affectedFamilies)} families</span></td>
        <td><span className={`risk-pill ${project.risk.toLowerCase().replace(' ', '-')}`}><i />{project.risk}</span></td>
        <td><ArrowRight size={15} className="row-arrow" /></td>
      </tr>)}</tbody>
    </table></div>
    {projects.length === 0 && <div className="empty-state"><Search size={22} /><strong>No matching projects</strong><span>Try another project name or state.</span></div>}
    <div className="table-footer"><span>Register data updates as workflow actions are recorded.</span><span>Showing <strong>{projects.length}</strong> projects</span></div>
  </section>;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function ReportsPage({ projects, acquired, proposed, assessed, paid, families, riskCount, onExport }: {
  projects: Project[]; acquired: number; proposed: number; assessed: number; paid: number; families: number; riskCount: number; onExport: () => void;
}) {
  const byState = [...new Set(projects.map((project) => project.state))].sort().map((state) => {
    const group = projects.filter((project) => project.state === state);
    return { state, count: group.length, acquired: group.reduce((sum, project) => sum + project.acquiredArea, 0), proposed: group.reduce((sum, project) => sum + project.proposedArea, 0), paid: group.reduce((sum, project) => sum + project.compensationPaid, 0) };
  });
  return <>
    <div className="report-summary"><article><span>Acquisition progress</span><strong>{formatNumber(proposed ? acquired / proposed * 100 : 0)}%</strong><small>{formatNumber(acquired, 1)} of {formatNumber(proposed, 1)} ha secured</small><ProgressBar value={proposed ? acquired / proposed * 100 : 0} /></article><article><span>Compensation disbursed</span><strong>₹{formatNumber(paid, 1)} Cr</strong><small>of ₹{formatNumber(assessed, 1)} Cr assessed</small><ProgressBar value={assessed ? paid / assessed * 100 : 0} /></article><article><span>Families in register</span><strong>{formatNumber(families)}</strong><small>Across {projects.length} active projects</small><div className="report-summary-foot"><AlertTriangle size={14} />{riskCount} cases need review</div></article></div>
    <section className="panel report-table-panel"><div className="panel-heading"><div><span className="section-kicker">STATE-WISE COMPARISON</span><h2>Acquisition performance</h2></div><button className="primary-button export-button" onClick={onExport}><Download size={15} />Export CSV</button></div><div className="table-scroll"><table className="project-table report-table"><thead><tr><th>STATE / UT</th><th>PROJECTS</th><th>LAND PROPOSED</th><th>LAND ACQUIRED</th><th>AREA PROGRESS</th><th>COMPENSATION PAID</th></tr></thead><tbody>{byState.map((row) => <tr key={row.state}><td><span className="table-project-name">{row.state}</span></td><td>{row.count}</td><td>{formatNumber(row.proposed, 1)} ha</td><td>{formatNumber(row.acquired, 1)} ha</td><td><div className="report-progress-cell"><ProgressBar value={row.proposed ? row.acquired / row.proposed * 100 : 0} /><span>{formatNumber(row.proposed ? row.acquired / row.proposed * 100 : 0)}%</span></div></td><td>₹{formatNumber(row.paid, 1)} Cr</td></tr>)}</tbody></table></div><div className="table-footer"><span>Consolidated monitoring view · Current demo dataset</span><button className="text-button" onClick={onExport}>Download detailed report <Download size={13} /></button></div></section>
    <p className="report-disclaimer">Financial amounts are shown in crore rupees. Sample values are illustrative and should not be used for official reporting.</p>
  </>;
}

type MilestoneDraft = { estimatedDate: string; completionDate: string; note: string };

function ProjectDrawer({ project, role, onClose, onStage, onMilestone, onUpload }: {
  project: Project;
  role: Role;
  onClose: () => void;
  onStage: (project: Project, stage: string) => void;
  onMilestone: (project: Project, stage: string, estimatedDate: string, completionDate: string, note: string) => Promise<void>;
  onUpload: (project: Project, stage: string, stageIndex: number, file: File) => Promise<MilestoneDocument>;
}) {
  const canManage = role !== 'Public Viewer';
  const [expandedStage, setExpandedStage] = useState(project.stage);
  const [drafts, setDrafts] = useState<Record<string, MilestoneDraft>>(() => Object.fromEntries(project.milestones.map((milestone) => [milestone.stage, {
    estimatedDate: milestone.estimatedDate || '',
    completionDate: milestone.completionDate || '',
    note: milestone.note,
  }])));
  const [savingStage, setSavingStage] = useState('');
  const [uploadingStage, setUploadingStage] = useState('');
  const [milestoneError, setMilestoneError] = useState('');
  useEffect(() => {
    setDrafts(Object.fromEntries(project.milestones.map((milestone) => [milestone.stage, {
      estimatedDate: milestone.estimatedDate || '',
      completionDate: milestone.completionDate || '',
      note: milestone.note,
    }])));
    setExpandedStage(project.stage);
  }, [project.id, project.milestones, project.stage]);

  function changeDraft(stage: string, change: Partial<MilestoneDraft>) {
    setDrafts((current) => ({
      ...current,
      [stage]: { ...(current[stage] || { estimatedDate: '', completionDate: '', note: '' }), ...change },
    }));
  }

  async function saveMilestone(stage: string) {
    const draft = drafts[stage] || { estimatedDate: '', completionDate: '', note: '' };
    if (draft.estimatedDate && draft.completionDate) {
      setMilestoneError('Use a completion date or an estimated date, not both.');
      return;
    }
    setSavingStage(stage);
    setMilestoneError('');
    try {
      await onMilestone(project, stage, draft.estimatedDate, draft.completionDate, draft.note);
    } catch (cause) {
      setMilestoneError(cause instanceof Error ? cause.message : 'Milestone update failed.');
    } finally {
      setSavingStage('');
    }
  }

  async function uploadDocument(stage: string, stageIndex: number, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setUploadingStage(stage);
    setMilestoneError('');
    try {
      await onUpload(project, stage, stageIndex, file);
    } catch (cause) {
      setMilestoneError(cause instanceof Error ? cause.message : 'Document upload failed.');
    } finally {
      setUploadingStage('');
      input.value = '';
    }
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="project-drawer" aria-label={`Project details for ${project.name}`}>
      <div className="drawer-top"><span className="section-kicker">PROJECT RECORD</span><button className="icon-button" aria-label="Close details" onClick={onClose}><X size={19} /></button></div>
      <span className="drawer-code">{project.code} <span>·</span> {project.agency}</span>
      <h2>{project.name}</h2>
      <p className="drawer-location"><MapPinned size={14} />{project.district}, {project.state}</p>
      <div className="drawer-stage"><span>CURRENT LIFECYCLE STAGE</span><strong className={`stage-pill ${stageClass(project.stage)}`}>{project.stage}</strong></div>
      <div className="drawer-progress"><div><span>Overall progress</span><strong>{project.progress}%</strong></div><ProgressBar value={project.progress} /></div>
      <div className="drawer-metrics"><div><span>Proposed land</span><strong>{formatNumber(project.proposedArea, 1)} ha</strong></div><div><span>Acquired</span><strong>{formatNumber(project.acquiredArea, 1)} ha</strong></div><div><span>Compensation assessed</span><strong>₹{formatNumber(project.compensationAssessed, 1)} Cr</strong></div><div><span>Compensation paid</span><strong>₹{formatNumber(project.compensationPaid, 1)} Cr</strong></div><div><span>Affected families</span><strong>{formatNumber(project.affectedFamilies)}</strong></div><div><span>Displaced families</span><strong>{formatNumber(project.displacedFamilies)}</strong></div><div><span>R&amp;R progress</span><strong>{project.rrProgress}%</strong></div><div><span>Possession</span><strong>{project.possessionStatus}</strong></div></div>
      <div className="drawer-timeline"><div className="drawer-section-title"><span>WORKFLOW MILESTONES</span><span>{lifecycle.indexOf(project.stage) + 1} / {lifecycle.length}</span></div>{lifecycle.map((stage, index) => {
        const current = lifecycle.indexOf(project.stage);
        const milestone = project.milestones.find((item) => item.stage === stage) || { stage, completionDate: null, estimatedDate: null, note: '', documents: [] };
        const draft = drafts[stage] || { estimatedDate: '', completionDate: '', note: '' };
        const complete = Boolean(milestone.completionDate);
        const expanded = expandedStage === stage;
        return <section className={`milestone-card ${complete ? 'milestone-done' : index === current ? 'milestone-current' : ''}`} key={stage}>
          <button className="timeline-item" aria-expanded={expanded} onClick={() => setExpandedStage(expanded ? '' : stage)}>
            <span className="timeline-node">{complete ? <Check size={11} /> : index + 1}</span>
            <span className="timeline-stage-copy"><strong>{stage}</strong><small>{complete ? `Completed ${formatDate(milestone.completionDate)}` : milestone.estimatedDate ? `Est. ${formatDate(milestone.estimatedDate)}` : 'Date not set'}</small></span>
            <span className={`timeline-status ${complete ? 'done' : index === current ? 'in-progress' : ''}`}>{complete ? 'Complete' : index === current ? 'In progress' : 'Upcoming'}</span>
            <ChevronDown size={15} className={`timeline-chevron ${expanded ? 'expanded' : ''}`} />
          </button>
          {expanded && <div className="milestone-details">
            <div className="milestone-date-grid">
              <label>Completion date<input aria-label={`${stage} completion date`} type="date" value={draft.completionDate} disabled={!canManage} onChange={(event) => changeDraft(stage, { completionDate: event.target.value, estimatedDate: '' })} /></label>
              <label>Estimated completion<input aria-label={`${stage} estimated completion`} type="date" value={draft.estimatedDate} disabled={!canManage} onChange={(event) => changeDraft(stage, { estimatedDate: event.target.value, completionDate: '' })} /></label>
            </div>
            <label className="milestone-note-field">Sanction / decision notes<textarea aria-label={`${stage} notes`} value={draft.note} rows={2} maxLength={2000} disabled={!canManage} placeholder="Order reference, issuing authority, or context" onChange={(event) => changeDraft(stage, { note: event.target.value })} /></label>
            <div className="milestone-documents">
              <div className="milestone-doc-heading"><span>Supporting documents</span><small>{milestone.documents.length}</small></div>
              {milestone.documents.length > 0 ? <div className="milestone-doc-list">{milestone.documents.map((document) => <a className="milestone-document" href={document.url} key={document.id} target="_blank" rel="noreferrer">
                <span className="document-icon"><FileText size={14} /></span><span className="document-meta"><strong>{document.fileName}</strong><small>{formatFileSize(document.fileSize)} · {document.uploadedBy}</small></span><Download size={14} className="document-download" />
              </a>)}</div> : <p className="no-documents">No certificates or records attached.</p>}
              {canManage && <label className="upload-document"><FilePlus2 size={14} />{uploadingStage === stage ? 'Uploading…' : 'Attach PDF or text file'}<input type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={uploadingStage === stage} onChange={(event) => void uploadDocument(stage, index, event)} /></label>}
            </div>
            {canManage && <button className="save-milestone" disabled={savingStage === stage || uploadingStage === stage} onClick={() => void saveMilestone(stage)}>{savingStage === stage ? 'Saving…' : 'Save milestone details'}</button>}
          </div>}
        </section>;
      })}</div>
      {milestoneError && <div className="milestone-error" role="alert">{milestoneError}</div>}
      {['District Authority', 'State Authority', 'Ministry'].includes(role) ? <label className="stage-update">Record lifecycle stage<select value={project.stage} onChange={(event) => onStage(project, event.target.value)}>{lifecycle.map((stage) => <option key={stage}>{stage}</option>)}</select><ChevronDown size={14} /></label> : role === 'Public Viewer' ? <div className="read-only-note"><ShieldCheck size={15} />Read-only for {role}</div> : <div className="read-only-note"><ShieldCheck size={15} />Project Agency can add evidence and milestone details</div>}
      <p className="drawer-updated">Last record update · {new Date(project.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
    </aside>
  </div>;
}

function CreateProjectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: ProjectInput) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({ code: String(form.get('code')), name: String(form.get('name')), state: String(form.get('state')), district: String(form.get('district')), agency: String(form.get('agency')), proposedArea: Number(form.get('proposedArea')) });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="proposal-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
      <div className="modal-header"><div><span className="section-kicker">NEW ACQUISITION RECORD</span><h2 id="proposal-title">Submit a proposal</h2></div><button className="icon-button" aria-label="Close form" onClick={onClose}><X size={19} /></button></div>
      <p className="modal-intro">Start a centrally tracked acquisition workflow. Fields can be expanded for production state-specific scrutiny.</p>
      <form onSubmit={submit} className="proposal-form">
        <label>Project reference<input name="code" placeholder="e.g. LA-KA-0241" required maxLength={32} /></label>
        <label>Project name<input name="name" placeholder="Infrastructure project name" required maxLength={220} /></label>
        <div className="form-row"><label>State / UT<input name="state" placeholder="State or Union Territory" required /></label><label>District<input name="district" placeholder="District" required /></label></div>
        <div className="form-row"><label>Implementing agency<input name="agency" placeholder="Ministry / agency" required /></label><label>Land proposed (ha)<input name="proposedArea" type="number" min="0.1" step="0.1" placeholder="0.0" required /></label></div>
        <div className="form-note"><ShieldCheck size={15} />This submission will enter the proposal and district scrutiny workflow.</div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><FilePlus2 size={15} />Submit proposal</button></div>
      </form>
    </section>
  </div>;
}

export default App;