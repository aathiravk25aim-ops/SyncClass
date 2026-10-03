import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  apiBase,
  createStudent,
  getActivity,
  getAttendance,
  getDashboard,
  getStudents,
  login,
  scan,
} from './api';
import type { Activity, Attendance, Dashboard, LoginResponse, Role, ScanResponse, Student } from './types';

type Tab = 'dashboard' | 'scanner' | 'students' | 'idcards' | 'attendance' | 'reports' | 'activity' | 'security';
type Action = 'identify' | 'checkin' | 'checkout';

const DEMO_CREDENTIALS: Record<Role, { username: string; password: string }> = {
  admin: { username: 'admin', password: 'admin123' },
  faculty: { username: 'faculty', password: 'faculty123' },
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printPage(mode: 'id-card' | 'report') {
  const cleanup = () => {
    document.body.removeAttribute('data-print-mode');
    window.removeEventListener('afterprint', cleanup);
  };
  document.body.setAttribute('data-print-mode', mode);
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${accent ?? ''}`}>{label.slice(0, 1)}</div>
      <div>
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
      </div>
    </div>
  );
}

function RolePill({ role }: { role: Role }) {
  return <span className={`role-pill ${role}`}>{role === 'admin' ? 'ADMIN' : 'FACULTY'}</span>;
}

function LoginScreen({ onLogin }: { onLogin: (response: LoginResponse) => void }) {
  const [role, setRole] = useState<Role>('admin');
  const [username, setUsername] = useState(DEMO_CREDENTIALS.admin.username);
  const [password, setPassword] = useState(DEMO_CREDENTIALS.admin.password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setUsername(DEMO_CREDENTIALS[nextRole].username);
    setPassword(DEMO_CREDENTIALS[nextRole].password);
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await login(username, password);
      onLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid" />
      <div className="auth-panel">
        <div className="brand-mark">ID</div>
        <div className="eyebrow">INSTITUTIONAL STUDENT IDENTITY PLATFORM</div>
        <h1>StudentID <span>Insight</span></h1>
        <p className="hero-copy">
          Camera-based student identification, attendance intelligence, audit trails and role-controlled records.
        </p>

        <form className="login-card" onSubmit={submit}>
          <div className="login-role-row">
            <button type="button" className={role === 'admin' ? 'role-choice active' : 'role-choice'} onClick={() => chooseRole('admin')}>
              Admin
            </button>
            <button type="button" className={role === 'faculty' ? 'role-choice active' : 'role-choice'} onClick={() => chooseRole('faculty')}>
              Faculty
            </button>
          </div>

          <label>Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          <label>Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-btn" disabled={busy}>{busy ? 'Signing in…' : 'Enter Command Center'}</button>
          <div className="demo-note">
            Prototype credentials · Admin: <b>admin / admin123</b> · Faculty: <b>faculty / faculty123</b>
          </div>
        </form>

        <div className="security-strip">
          <span>🔐 Role-based access</span>
          <span>📷 Camera permission</span>
          <span>🧾 Audit logging</span>
        </div>
      </div>
    </div>
  );
}

function Scanner({ token, onScanned }: { token: string; onScanned: (result: ScanResponse) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<Action>('identify');
  const [error, setError] = useState('');
  const lastTokenRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner.stop().catch(() => undefined).finally(() => {
          try { scanner.clear(); } catch { /* ignore */ }
        });
      }
    };
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    if (!scanner) {
      if (mountedRef.current) setRunning(false);
      return;
    }
    try { await scanner.stop(); } catch { /* already stopped */ }
    try { scanner.clear(); } catch { /* already cleared */ }
    if (mountedRef.current) setRunning(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current || scannerRef.current) return;
    setError('');
    startingRef.current = true;

    const reader = new Html5Qrcode('qr-reader', {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    scannerRef.current = reader;

    try {
      await reader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          if (!mountedRef.current || decodedText === lastTokenRef.current) return;
          lastTokenRef.current = decodedText;
          try {
            const result = await scan(token, decodedText, action);
            if (!mountedRef.current) return;
            onScanned(result);
            await stopScanner();
            window.setTimeout(() => { lastTokenRef.current = ''; }, 1200);
          } catch (err) {
            if (!mountedRef.current) return;
            setError(err instanceof Error ? err.message : 'Scan rejected');
            window.setTimeout(() => { lastTokenRef.current = ''; }, 1200);
          }
        },
        () => undefined,
      );
      if (mountedRef.current) setRunning(true);
      else await stopScanner();
    } catch (err) {
      scannerRef.current = null;
      try { await reader.stop(); } catch { /* camera did not start */ }
      try { reader.clear(); } catch { /* ignore */ }
      if (mountedRef.current) {
        setRunning(false);
        setError(err instanceof Error ? `Camera could not start: ${err.message}` : 'Camera could not start. Use localhost/HTTPS and allow camera permission.');
      }
    } finally {
      startingRef.current = false;
    }
  }, [action, onScanned, stopScanner, token]);

  return (
    <div className="scanner-card">
      <div className="scanner-topline">
        <div>
          <div className="section-kicker">LIVE SCANNER</div>
          <h2>Scan Student ID</h2>
          <p>QR contains an opaque token. Personal data is resolved by the authenticated backend.</p>
        </div>
        <div className="status-pill"><span className={running ? 'dot live' : 'dot'} /> {running ? 'Camera live' : 'Camera idle'}</div>
      </div>

      <div className="action-grid">
        {(['identify', 'checkin', 'checkout'] as Action[]).map((item) => (
          <button
            key={item}
            className={`action-btn ${action === item ? 'selected' : ''}`}
            onClick={() => { if (running) void stopScanner(); setAction(item); setError(''); }}
          >
            <span>{item === 'identify' ? '🔎' : item === 'checkin' ? '🟢' : '🔴'}</span>
            <strong>{item === 'identify' ? 'Identify' : item === 'checkin' ? 'Check In' : 'Check Out'}</strong>
            <small>{item === 'identify' ? 'View profile' : item === 'checkin' ? 'Record arrival' : 'Record departure'}</small>
          </button>
        ))}
      </div>

      <div className="reader-wrap">
        <div id="qr-reader" className="qr-reader" />
        <div className="reader-overlay" style={{ display: running ? 'none' : 'flex' }}>
          <div className="camera-icon">▣</div>
          <div className="reader-title">Camera ready</div>
          <div className="reader-subtitle">Start scanning to identify a student</div>
        </div>
      </div>

      <div className="scanner-controls">
        {!running ? (
          <button className="primary-btn" onClick={() => void startScanner()}>Start Camera</button>
        ) : (
          <button className="secondary-btn" onClick={() => void stopScanner()}>Stop Camera</button>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

function ProtectedQr({ token, rollNumber, name }: { token: string; rollNumber: string; name: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    fetch(`${apiBase}/students/${encodeURIComponent(rollNumber)}/qr`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load QR');
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => { if (!cancelled) setSrc(''); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rollNumber, token]);

  return src ? <img src={src} alt={`Protected QR for ${name}`} /> : <div className="qr-loading">QR</div>;
}

function StudentCard({ result }: { result: ScanResponse | null }) {
  if (!result?.student) {
    return (
      <div className="empty-card">
        <div className="empty-icon">ID</div>
        <h3>No student scanned yet</h3>
        <p>The verified student profile will appear here after a successful scan.</p>
      </div>
    );
  }
  const student = result.student;
  return (
    <div className="student-card">
      <div className="student-head">
        <div className="avatar">{student.name.split(' ').map((v) => v[0]).slice(0, 2).join('')}</div>
        <div>
          <div className="verified">✓ VERIFIED STUDENT</div>
          <h2>{student.name}</h2>
          <div className="roll-chip">{student.roll_number}</div>
        </div>
      </div>
      <div className="result-banner">{result.message}</div>
      <div className="profile-grid">
        <div><span>Department</span><strong>{student.department}</strong></div>
        <div><span>Class</span><strong>{student.class_name}</strong></div>
        <div><span>Year</span><strong>{student.year}</strong></div>
        <div><span>Email</span><strong>{student.email}</strong></div>
        <div><span>Phone</span><strong>{student.phone || 'Not provided'}</strong></div>
        <div><span>Scan time</span><strong>{formatDate(result.scanned_at)}</strong></div>
      </div>
    </div>
  );
}

function DashboardPage({ dashboard, activity, attendance }: { dashboard: Dashboard | null; activity: Activity[]; attendance: Attendance[] }) {
  const recent = activity.slice(0, 6);
  const rate = dashboard?.attendance_rate ?? 0;
  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <div className="section-kicker">COMMAND OVERVIEW</div>
          <h2>Department identity & attendance at a glance</h2>
          <p>Real-time scan activity, attendance state and secure student identity workflows.</p>
        </div>
        <div className="hero-score"><strong>{rate}%</strong><span>today's attendance</span></div>
      </section>

      <div className="metrics-grid compact">
        <Metric label="Registered students" value={dashboard?.total_students ?? 0} />
        <Metric label="Scans today" value={dashboard?.scans_today ?? 0} accent="green" />
        <Metric label="Check-ins today" value={dashboard?.checkins_today ?? 0} accent="orange" />
        <Metric label="Active estimate" value={dashboard?.active_students_estimate ?? 0} accent="violet" />
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-head"><div><div className="section-kicker">ATTENDANCE HEALTH</div><h2>Today</h2></div></div>
          <div className="attendance-summary">
            <div><strong>{dashboard?.present_today ?? 0}</strong><span>Present</span></div>
            <div><strong>{dashboard?.late_today ?? 0}</strong><span>Late</span></div>
            <div><strong>{dashboard?.absent_today ?? 0}</strong><span>Absent</span></div>
            <div><strong>{rate}%</strong><span>Rate</span></div>
          </div>
          <div className="progress-track"><div style={{ width: `${rate}%` }} /></div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><div className="section-kicker">ROLE-AWARE SESSION</div><h2>Security posture</h2></div></div>
          <div className="security-mini-grid">
            <div>🔐 <span>Authentication</span><b>Active</b></div>
            <div>🪪 <span>QR Token</span><b>Opaque</b></div>
            <div>🧾 <span>Audit Log</span><b>Enabled</b></div>
            <div>🛡️ <span>API Access</span><b>Protected</b></div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><div><div className="section-kicker">LIVE ACTIVITY</div><h2>Recent events</h2></div></div>
        <div className="activity-list">
          {recent.map((item) => (
            <div className="activity-row" key={item.id}>
              <div className={`activity-icon ${item.action}`}>{item.action === 'identify' ? '🔎' : item.action === 'checkin' ? '↪' : '↩'}</div>
              <div className="activity-main"><strong>{item.student_name}</strong><span>{item.roll_number} · {item.device}</span></div>
              <div className="activity-action">{item.action}</div>
              <div className="activity-time">{formatDate(item.scanned_at)}</div>
            </div>
          ))}
          {!recent.length && <div className="empty-state">No activity yet.</div>}
        </div>
      </section>

      <div className="hidden-count">{attendance.length} attendance records loaded</div>
    </div>
  );
}

function StudentsPage({
  token,
  role,
  students,
  search,
  setSearch,
  classFilter,
  setClassFilter,
  onCreated,
}: {
  token: string;
  role: Role;
  students: Student[];
  search: string;
  setSearch: (value: string) => void;
  classFilter: string;
  setClassFilter: (value: string) => void;
  onCreated: () => void;
}) {
  const classes = Array.from(new Set(students.map((student) => student.class_name))).sort();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ roll_number: '', name: '', department: 'AI & Data Science', class_name: 'III ADS', year: 3, email: '', phone: '' });
  const [message, setMessage] = useState('');

  async function addStudent(event: FormEvent) {
    event.preventDefault();
    try {
      await createStudent(token, form);
      setForm({ roll_number: '', name: '', department: 'AI & Data Science', class_name: 'III ADS', year: 3, email: '', phone: '' });
      setMessage('Student added successfully.');
      onCreated();
      setFormOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to add student');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div><div className="section-kicker">DIRECTORY</div><h2>Department Students</h2><p className="panel-subtitle">Search and filter 50 synthetic students for the prototype.</p></div>
        <div className="toolbar-inline">
          <input className="search-input" placeholder="Search roll no, name, class…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="filter-select" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="">All classes</option>
            {classes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {role === 'admin' && <button className="secondary-btn" onClick={() => setFormOpen((value) => !value)}>{formOpen ? 'Close' : '+ Add Student'}</button>}
        </div>
      </div>

      {formOpen && role === 'admin' && (
        <form className="inline-form" onSubmit={addStudent}>
          <input placeholder="Roll number" value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} required />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <button className="primary-btn" type="submit">Create</button>
          {message && <span className="form-message">{message}</span>}
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Roll no</th><th>Name</th><th>Department</th><th>Class</th><th>Email</th><th>Role access</th></tr></thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td><span className="roll-chip">{student.roll_number}</span></td>
                <td><strong>{student.name}</strong></td>
                <td>{student.department}</td>
                <td>{student.class_name}</td>
                <td>{student.email}</td>
                <td><span className="muted">Protected by session</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!students.length && <div className="empty-state">No students match the current filter.</div>}
      </div>
    </section>
  );
}

function IdCardsPage({ token, students }: { token: string; students: Student[] }) {
  const [query, setQuery] = useState('');
  const [selectedRoll, setSelectedRoll] = useState(students[0]?.roll_number ?? '');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => !q || student.roll_number.toLowerCase().includes(q) || student.name.toLowerCase().includes(q));
  }, [query, students]);
  const selected = students.find((student) => student.roll_number === selectedRoll) ?? filtered[0] ?? students[0];

  useEffect(() => {
    if (filtered.length && !filtered.some((student) => student.roll_number === selectedRoll)) setSelectedRoll(filtered[0].roll_number);
  }, [filtered, selectedRoll]);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-head">
          <div><div className="section-kicker">DIGITAL IDENTITY</div><h2>Student ID Cards</h2><p className="panel-subtitle">Every QR is a protected opaque token; it does not expose student details.</p></div>
          <input className="search-input" placeholder="Find a student…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="id-list">
          {filtered.map((student) => (
            <button key={student.roll_number} className={`id-list-item ${selected?.roll_number === student.roll_number ? 'selected' : ''}`} onClick={() => setSelectedRoll(student.roll_number)}>
              <span className="id-mini-avatar">{student.name.split(' ').map((v) => v[0]).slice(0, 2).join('')}</span>
              <span><b>{student.name}</b><small>{student.roll_number} · {student.class_name}</small></span>
              <span className="chevron">→</span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="id-preview-panel">
          <div className="section-kicker">SELECTED IDENTITY</div>
          <StudentIdCard token={token} student={selected} />
        </section>
      )}
    </div>
  );
}

function StudentIdCard({ token, student }: { token: string; student: Student }) {
  return (
    <div className="id-card-wrapper">
      <div className="student-id-card" id="student-id-card">
        <div className="id-card-header">
          <div className="id-brand-mark">ID</div>
          <div><div className="id-college-name">STUDENTID INSIGHT</div><div className="id-department">DEPARTMENT STUDENT ID</div></div>
        </div>
        <div className="id-card-body">
          <div className="id-profile">
            <div className="id-avatar">{student.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
            <div className="id-details">
              <div className="id-label">STUDENT NAME</div>
              <h2>{student.name}</h2>
              <div className="id-roll">{student.roll_number}</div>
              <div className="id-detail-row"><span>Department</span><strong>{student.department}</strong></div>
              <div className="id-detail-row"><span>Class</span><strong>{student.class_name}</strong></div>
              <div className="id-detail-row"><span>Year</span><strong>{student.year}</strong></div>
            </div>
          </div>
          <div className="id-qr-section"><ProtectedQr token={token} rollNumber={student.roll_number} name={student.name} /><div className="qr-caption">SECURE ID</div><div className="qr-subcaption">Scan for verification</div></div>
        </div>
        <div className="id-card-footer"><span>Department Access Platform</span><span>● AUTHENTICATED</span></div>
      </div>
      <button className="primary-btn print-btn" onClick={() => printPage('id-card')}>🖨️ Print / Save PDF</button>
    </div>
  );
}

function AttendancePage({ attendance }: { attendance: Attendance[] }) {
  const [status, setStatus] = useState('All');
  const [query, setQuery] = useState('');
  const filtered = attendance.filter((item) => {
    const q = query.trim().toLowerCase();
    const matchesStatus = status === 'All' || item.status === status;
    const matchesQuery = !q || item.roll_number.toLowerCase().includes(q) || item.student_name.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
  const present = attendance.filter((item) => item.status === 'Present').length;
  const late = attendance.filter((item) => item.status === 'Late').length;
  const absent = attendance.filter((item) => item.status === 'Absent').length;
  const rate = attendance.length ? Math.round(((present + late) / attendance.length) * 100) : 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <div><div className="section-kicker">TODAY'S ATTENDANCE</div><h2>Department Attendance Dashboard</h2><p className="panel-subtitle">Attendance is derived from today's authenticated scan events. Check-ins after 09:15 are marked Late.</p></div>
        <div className="toolbar-inline">
          <input className="search-input" placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option><option>Present</option><option>Late</option><option>Absent</option>
          </select>
          <button className="secondary-btn" onClick={() => downloadCsv('studentid-attendance.csv', ['Roll Number', 'Student', 'Department', 'Class', 'Status', 'Check In', 'Check Out'], attendance.map((item) => [item.roll_number, item.student_name, item.department, item.class_name, item.status, item.checkin_time ? formatDate(item.checkin_time) : '', item.checkout_time ? formatDate(item.checkout_time) : '']))}>CSV</button>
          <button className="secondary-btn" onClick={() => printPage('report')}>PDF / Print</button>
        </div>
      </div>

      <div className="attendance-summary">
        <div><strong>{present}</strong><span>Present</span></div>
        <div><strong>{late}</strong><span>Late</span></div>
        <div><strong>{absent}</strong><span>Absent</span></div>
        <div><strong>{rate}%</strong><span>Attendance Rate</span></div>
      </div>
      <div className="progress-track"><div style={{ width: `${rate}%` }} /></div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Roll no</th><th>Name</th><th>Class</th><th>Status</th><th>Check-in</th><th>Check-out</th></tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.roll_number}>
                <td><span className="roll-chip">{item.roll_number}</span></td>
                <td><strong>{item.student_name}</strong></td>
                <td>{item.class_name}</td>
                <td><span className={`attendance-badge ${item.status.toLowerCase()}`}>{item.status}</span></td>
                <td>{formatDate(item.checkin_time)}</td>
                <td>{formatDate(item.checkout_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportsPage({ attendance, activity, dashboard }: { attendance: Attendance[]; activity: Activity[]; dashboard: Dashboard | null }) {
  const attendanceRows = attendance.map((item) => [item.roll_number, item.student_name, item.status, item.checkin_time ? formatDate(item.checkin_time) : '', item.checkout_time ? formatDate(item.checkout_time) : '']);
  const activityRows = activity.map((item) => [item.roll_number, item.student_name, item.action, item.device, formatDate(item.scanned_at)]);
  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div><div className="section-kicker">REPORT CENTER</div><h2>Selection-round reporting</h2><p>Download CSV files or use the browser's print dialog to save a polished PDF report.</p></div>
        <div className="report-score"><strong>{dashboard?.attendance_rate ?? 0}%</strong><span>current attendance</span></div>
      </section>
      <div className="two-column">
        <section className="panel report-card"><div className="report-icon">📊</div><h3>Attendance Report</h3><p>All student attendance records, status and check-in/check-out times.</p><div className="report-actions"><button className="primary-btn" onClick={() => downloadCsv('studentid-attendance.csv', ['Roll Number', 'Student', 'Status', 'Check In', 'Check Out'], attendanceRows)}>Download CSV</button><button className="secondary-btn" onClick={() => printPage('report')}>Print / Save PDF</button></div></section>
        <section className="panel report-card"><div className="report-icon">🧾</div><h3>Audit Activity Report</h3><p>Recent identification, check-in and check-out events with device information.</p><div className="report-actions"><button className="primary-btn" onClick={() => downloadCsv('studentid-activity.csv', ['Roll Number', 'Student', 'Action', 'Device', 'Time'], activityRows)}>Download CSV</button><button className="secondary-btn" onClick={() => printPage('report')}>Print / Save PDF</button></div></section>
      </div>
    </div>
  );
}

function ActivityPage({ activity }: { activity: Activity[] }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><div className="section-kicker">AUDIT LOG</div><h2>Recent Scan Events</h2><p className="panel-subtitle">Every scan is retained as an auditable event in the prototype database.</p></div></div>
      <div className="activity-list">
        {activity.map((item) => (
          <div className="activity-row" key={item.id}>
            <div className={`activity-icon ${item.action}`}>{item.action === 'identify' ? '🔎' : item.action === 'checkin' ? '↪' : '↩'}</div>
            <div className="activity-main"><strong>{item.student_name}</strong><span>{item.roll_number} · {item.device}</span></div>
            <div className="activity-action">{item.action}</div>
            <div className="activity-time">{formatDate(item.scanned_at)}</div>
          </div>
        ))}
        {!activity.length && <div className="empty-state">No events yet. Start with the Scanner.</div>}
      </div>
    </section>
  );
}

function SecurityPage({ username, role }: { username: string; role: Role }) {
  return (
    <div className="page-grid">
      <section className="hero-panel"><div><div className="section-kicker">PRIVACY & SECURITY</div><h2>Institutional safeguards</h2><p>The prototype separates camera capture from personal-data resolution and enforces role-aware API access.</p></div><RolePill role={role} /></section>
      <div className="two-column">
        <section className="panel"><div className="panel-head"><div><div className="section-kicker">SESSION</div><h2>Current access</h2></div></div><div className="session-grid"><div><span>User</span><b>{username}</b></div><div><span>Role</span><b>{role}</b></div><div><span>API session</span><b>JWT bearer</b></div><div><span>Camera</span><b>Browser permission</b></div></div></section>
        <section className="panel"><div className="panel-head"><div><div className="section-kicker">QR DESIGN</div><h2>Privacy-first identity</h2></div></div><div className="security-list"><div>🟢 QR payload <b>Opaque random token</b></div><div>🟢 Student details <b>Backend only</b></div><div>🟢 API lookup <b>Authenticated</b></div><div>🟢 Events <b>Auditable</b></div></div></section>
      </div>
      <section className="panel">
        <div className="section-kicker">PRODUCTION CHECKLIST</div>
        <h2>What changes before college-wide deployment?</h2>
        <div className="checklist-grid">
          <div>🔐 Institutional SSO / OAuth2</div><div>🗃️ PostgreSQL + encrypted backups</div><div>🧑‍💼 Fine-grained staff roles</div><div>🌐 HTTPS everywhere</div><div>🧾 Retention & audit policy</div><div>🔒 Data minimization by role</div><div>📱 Mobile-friendly secure access</div><div>🏫 SIS / ERP integration</div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('studentid_token') ?? '');
  const [username, setUsername] = useState(() => sessionStorage.getItem('studentid_user') ?? '');
  const [role, setRole] = useState<Role>(() => (sessionStorage.getItem('studentid_role') as Role) || 'faculty');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [dash, studentRows, events, attendanceRows] = await Promise.all([
        getDashboard(token),
        getStudents(token, search, classFilter),
        getActivity(token),
        getAttendance(token),
      ]);
      setDashboard(dash);
      setStudents(studentRows);
      setActivity(events);
      setAttendance(attendanceRows);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load command center');
      if (String(err).includes('401')) logout();
    }
  }, [classFilter, search, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  function handleLogin(response: LoginResponse) {
    sessionStorage.setItem('studentid_token', response.access_token);
    sessionStorage.setItem('studentid_user', response.username);
    sessionStorage.setItem('studentid_role', response.role);
    setToken(response.access_token);
    setUsername(response.username);
    setRole(response.role);
    setTab('dashboard');
  }

  function logout() {
    sessionStorage.removeItem('studentid_token');
    sessionStorage.removeItem('studentid_user');
    sessionStorage.removeItem('studentid_role');
    setToken('');
    setUsername('');
    setRole('faculty');
  }

  const handleScanned = useCallback((scanResult: ScanResponse) => {
    setResult(scanResult);
    void refresh();
  }, [refresh]);

  const subtitle = useMemo(() => {
    const map: Record<Tab, string> = {
      dashboard: 'Department-wide identity and attendance overview.',
      scanner: 'Live camera identification and controlled scan actions.',
      students: 'Search, filter and manage the protected student directory.',
      idcards: 'Generate, preview and print secure student ID cards.',
      attendance: 'Track present, late and absent students in real time.',
      reports: 'Export attendance and audit activity for institutional use.',
      activity: 'Review recent identification and attendance-ready audit events.',
      security: 'Privacy, role access and deployment safeguards.',
    };
    return map[tab];
  }, [tab]);

  if (!token) return <LoginScreen onLogin={handleLogin} />;

  const navItems: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'scanner', label: '📷 Scanner' },
    { id: 'students', label: '👥 Students' },
    { id: 'idcards', label: '🪪 ID Cards' },
    { id: 'attendance', label: '📅 Attendance' },
    { id: 'reports', label: '📁 Reports' },
    { id: 'activity', label: '🧾 Activity' },
    { id: 'security', label: '🛡️ Security' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mini">ID</div><div><strong>StudentID Insight</strong><span>Department Command Center</span></div></div>
        <div className="top-actions"><div className="session-user"><strong>{username}</strong><RolePill role={role} /></div><div className="security-status"><span className="dot live" /> Secure session</div><button className="logout-btn" onClick={logout}>Logout</button></div>
      </header>

      <main className="content">
        <section className="hero-row"><div><div className="eyebrow">PS2 · STUDENT IDENTIFICATION & ATTENDANCE</div><h1>Department Identity <span>Command Center</span></h1><p>{subtitle}</p></div><div className="hero-badge">Prototype v2.0</div></section>
        {error && <div className="error-banner global-error">{error}</div>}

        <section className="metrics-grid">
          <Metric label="Registered students" value={dashboard?.total_students ?? 0} />
          <Metric label="Scans today" value={dashboard?.scans_today ?? 0} accent="green" />
          <Metric label="Check-ins today" value={dashboard?.checkins_today ?? 0} accent="orange" />
          <Metric label="Attendance rate" value={`${dashboard?.attendance_rate ?? 0}%`} accent="violet" />
        </section>

        <nav className="tabs">{navItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>

        {tab === 'dashboard' && <DashboardPage dashboard={dashboard} activity={activity} attendance={attendance} />}

        {tab === 'scanner' && (
          <div className="dashboard-grid"><Scanner token={token} onScanned={handleScanned} /><div className="right-stack"><StudentCard result={result} /><div className="demo-panel"><div className="section-kicker">SELECTION ROUND DEMO</div><h2>Sample QR cards</h2><p>Use these protected QRs during the live demo.</p><div className="qr-grid">{students.slice(0, 4).map((student) => <div className="qr-card" key={student.roll_number}><ProtectedQr token={token} rollNumber={student.roll_number} name={student.name} /><strong>{student.roll_number}</strong><span>{student.name}</span></div>)}</div><div className="privacy-note">🔒 QR is an opaque token; student details remain server-side.</div></div></div></div>
        )}

        {tab === 'students' && <StudentsPage token={token} role={role} students={students} search={search} setSearch={(value) => { setSearch(value); setClassFilter(''); }} classFilter={classFilter} setClassFilter={setClassFilter} onCreated={() => void refresh()} />}
        {tab === 'idcards' && <IdCardsPage token={token} students={students} />}
        {tab === 'attendance' && <AttendancePage attendance={attendance} />}
        {tab === 'reports' && <ReportsPage attendance={attendance} activity={activity} dashboard={dashboard} />}
        {tab === 'activity' && <ActivityPage activity={activity} />}
        {tab === 'security' && <SecurityPage username={username} role={role} />}

        <footer><span>StudentID Insight · institutional prototype</span><span>PII stays behind authenticated APIs · production: SSO + PostgreSQL + HTTPS</span></footer>
      </main>
    </div>
  );
}
