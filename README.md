# StudentID Insight — Final Department-Level Prototype

StudentID Insight is a full-stack prototype for **PS2 – Student Identification & Attendance**. It is designed for a selection-round demonstration and a clear path to department-level deployment.

## What is included in this final version

- **Admin + Faculty role-based login**
- **50 synthetic AI & Data Science student records**
- Secure **opaque-token QR identification**
- Browser/mobile-friendly **live QR scanner**
- **Identify / Check In / Check Out** actions
- Student profile verification
- Student directory with **search + class filter**
- Admin-only **Add Student** workflow
- **Student ID Card** preview with protected QR
- **Print / Save PDF** using the browser print dialog
- Department **attendance dashboard**
- Present / Late / Absent status
- Attendance search + status filter
- **CSV export** for attendance and audit events
- **PDF/print reporting**
- Full activity/audit log
- Dedicated **Privacy & Security** panel
- Responsive UI for laptop and mobile browser sizes
- **Vercel frontend + Render backend** deployment configuration
- SQLite for local prototype, PostgreSQL-ready production path

## Technology stack

### Frontend
- React 19
- TypeScript
- Vite 8
- html5-qrcode
- Responsive CSS

### Backend
- Python 3.13+
- FastAPI
- SQLModel
- SQLite
- PyJWT
- qrcode

## Demo credentials

### Admin
```text
Username: admin
Password: admin123
```

Admin can access the complete prototype and can add new students.

### Faculty
```text
Username: faculty
Password: faculty123
```

Faculty can scan students, view attendance, reports, students, ID cards and activity, but cannot use the admin-only Add Student endpoint.

> These are demonstration credentials only. Replace them before real deployment.

## Project structure

```text
StudentID_Insight/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   └── db.py
│   ├── seed.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   ├── vite.config.ts
│   ├── vercel.json
│   └── .env.example
├── render.yaml
└── README.md
```

## Local setup in VS Code

### 1. Backend

Open Terminal 1:

```powershell
cd StudentID_Insight\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python seed.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend health:

```text
http://localhost:8000/api/health
```

Swagger API:

```text
http://localhost:8000/docs
```

### 2. Frontend

Open Terminal 2:

```powershell
cd StudentID_Insight\frontend
npm install
copy .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Final demo flow

### A. Login

Choose Admin or Faculty.

### B. Dashboard

Show:
- registered students
- scans today
- check-ins today
- attendance rate
- attendance health
- security posture
- recent events

### C. Scanner

1. Open Scanner.
2. Select Identify.
3. Start Camera.
4. Scan a protected student QR.
5. Show the verified student profile.
6. Repeat with Check In.
7. Repeat with Check Out.

### D. Students

Demonstrate search and class filtering.

Admin can also create a new prototype student using **+ Add Student**.

### E. ID Cards

1. Search a student.
2. Select the student.
3. Show the professional card.
4. Click **Print / Save PDF**.
5. Use that QR card in the Scanner demo.

### F. Attendance

Show:
- Present
- Late
- Absent
- Attendance rate
- Search
- Status filter
- CSV export
- Print / Save PDF

### G. Reports

Show separate exports for:
- Attendance report
- Audit activity report

### H. Security

Explain:
- QR contains an opaque random token.
- Student personal data is not embedded in the QR.
- Student records are returned through authenticated APIs.
- Admin and faculty roles have different permissions.
- Scan events create an audit trail.

## Attendance rule used in the prototype

For the demo:

```text
No check-in           → Absent
Check-in by 09:15     → Present
Check-in after 09:15  → Late
```

This should become a configurable timetable/grace-period rule in a real institutional deployment.

## Deployment

### Backend — Render

The included `render.yaml` is configured for a Python web service.

Set these environment variables on Render:

```text
JWT_SECRET=<strong-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-admin-password>
FACULTY_USERNAME=faculty
FACULTY_PASSWORD=<strong-faculty-password>
FRONTEND_ORIGIN=https://YOUR-VERCEL-DOMAIN
```

The local SQLite database is convenient for the prototype. For production, use PostgreSQL by setting `DATABASE_URL`.

### Frontend — Vercel

Create a Vercel project from the `frontend` directory and set:

```text
VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND/api
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

The included `frontend/vercel.json` already supplies these settings.

### Mobile camera deployment

Browser camera access should be served over HTTPS in deployment. Localhost is suitable for local development.

## Production security checklist

This prototype intentionally keeps the first deployment simple. Before college-wide deployment:

1. Replace demo credentials with institutional SSO/OAuth2.
2. Move from SQLite to PostgreSQL.
3. Use strong secrets and HTTPS.
4. Add granular RBAC for admin, faculty, security and auditor roles.
5. Define data retention and deletion policies.
6. Minimize the personal information returned to each role.
7. Protect database backups and audit logs.
8. Add rate limiting and monitoring.
9. Integrate with the existing SIS/ERP rather than duplicating authoritative student data.
10. Obtain institutional approval for privacy, attendance and CCTV-related workflows.

## PS1 future integration

The same platform can later connect with **PS1 – Department Occupancy Tracking**:

```text
PS2 Identity Layer
  QR + Attendance + Staff Access
              │
              ▼
     Department Command Center
              ▲
              │
PS1 Occupancy Layer
  CCTV + Detection + Tracking
```

The first selection-round implementation stays focused on PS2 so it can be demonstrated reliably with a normal laptop and phone camera.
