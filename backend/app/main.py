import hashlib
import io
import os
import secrets
from datetime import datetime, timezone
from typing import Annotated

import qrcode
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from .db import get_session, init_db
from .models import ScanEvent, Student
from .schemas import (
    ActivityResponse,
    AttendanceResponse,
    DashboardResponse,
    LoginRequest,
    LoginResponse,
    ScanRequest,
    ScanResponse,
    StudentCreate,
    StudentResponse,
)
from .security import TOKEN_MINUTES, authenticate, create_token, require_role, require_user

load_dotenv()

app = FastAPI(
    title=os.getenv("APP_NAME", "StudentID Insight API"),
    version="2.0.0",
    description="Department-level student identification, attendance, RBAC and audit prototype.",
)

origins = [
    os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(origins)),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def to_student_response(student: Student) -> StudentResponse:
    return StudentResponse(
        id=student.id or 0,
        roll_number=student.roll_number,
        name=student.name,
        department=student.department,
        class_name=student.class_name,
        year=student.year,
        email=student.email,
        phone=student.phone,
        created_at=student.created_at,
    )


def utc_today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)


def attendance_rows(session: Session) -> list[AttendanceResponse]:
    start = utc_today_start()
    students = session.exec(select(Student).order_by(Student.roll_number)).all()
    events = session.exec(
        select(ScanEvent)
        .where(ScanEvent.scanned_at >= start)
        .order_by(ScanEvent.scanned_at)
    ).all()

    by_student: dict[int, list[ScanEvent]] = {}
    for event in events:
        by_student.setdefault(event.student_id, []).append(event)

    result: list[AttendanceResponse] = []
    for student in students:
        rows = by_student.get(student.id or 0, [])
        checkins = [event for event in rows if event.action == "checkin"]
        checkouts = [event for event in rows if event.action == "checkout"]
        latest_checkin = checkins[-1] if checkins else None
        latest_checkout = checkouts[-1] if checkouts else None

        if latest_checkin is None:
            status = "Absent"
        else:
            checkin = latest_checkin.scanned_at
            status = (
                "Late"
                if checkin.hour > 9 or (checkin.hour == 9 and checkin.minute > 15)
                else "Present"
            )

        result.append(
            AttendanceResponse(
                roll_number=student.roll_number,
                student_name=student.name,
                department=student.department,
                class_name=student.class_name,
                status=status,
                checkin_time=latest_checkin.scanned_at if latest_checkin else None,
                checkout_time=latest_checkout.scanned_at if latest_checkout else None,
            )
        )
    return result


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def root() -> dict[str, str]:
    return {"name": app.title, "status": "online", "docs": "/docs"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    role = authenticate(payload.username, payload.password)
    if role is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(
        access_token=create_token(payload.username, role),
        expires_in_minutes=TOKEN_MINUTES,
        username=payload.username,
        role=role,  # type: ignore[arg-type]
    )


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard(
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
) -> DashboardResponse:
    events = session.exec(select(ScanEvent).where(ScanEvent.scanned_at >= utc_today_start())).all()
    rows = attendance_rows(session)
    present = sum(row.status == "Present" for row in rows)
    late = sum(row.status == "Late" for row in rows)
    absent = sum(row.status == "Absent" for row in rows)
    rate = round(((present + late) / len(rows)) * 100) if rows else 0

    latest_by_student: dict[int, ScanEvent] = {}
    for event in sorted(events, key=lambda item: item.scanned_at):
        latest_by_student[event.student_id] = event

    active_estimate = sum(
        1 for event in latest_by_student.values() if event.action == "checkin"
    )

    return DashboardResponse(
        total_students=len(session.exec(select(Student)).all()),
        scans_today=len(events),
        checkins_today=sum(event.action == "checkin" for event in events),
        checkouts_today=sum(event.action == "checkout" for event in events),
        identified_today=sum(event.action == "identify" for event in events),
        active_students_estimate=active_estimate,
        present_today=present,
        late_today=late,
        absent_today=absent,
        attendance_rate=rate,
    )


@app.get("/api/students", response_model=list[StudentResponse])
def list_students(
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
    q: str = Query(default="", max_length=80),
    class_name: str = Query(default="", max_length=80),
) -> list[StudentResponse]:
    students = session.exec(select(Student).order_by(Student.roll_number)).all()
    query = q.strip().lower()
    target_class = class_name.strip().lower()
    if query:
        students = [
            student
            for student in students
            if query in student.roll_number.lower()
            or query in student.name.lower()
            or query in student.department.lower()
            or query in student.class_name.lower()
        ]
    if target_class:
        students = [student for student in students if student.class_name.lower() == target_class]
    return [to_student_response(student) for student in students]


@app.post("/api/students", response_model=StudentResponse)
def create_student(
    payload: StudentCreate,
    _: Annotated[dict[str, str], Depends(require_role("admin"))],
    session: Session = Depends(get_session),
) -> StudentResponse:
    normalized_roll = payload.roll_number.strip().upper()
    existing = session.exec(select(Student).where(Student.roll_number == normalized_roll)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Roll number already exists")

    student = Student(
        roll_number=normalized_roll,
        name=payload.name.strip(),
        department=payload.department.strip(),
        class_name=payload.class_name.strip(),
        year=payload.year,
        email=payload.email.strip(),
        phone=payload.phone.strip(),
        qr_token=secrets.token_urlsafe(24),
    )
    session.add(student)
    session.commit()
    session.refresh(student)
    return to_student_response(student)


@app.get("/api/students/{roll_number}/qr")
def student_qr(
    roll_number: str,
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
) -> StreamingResponse:
    student = session.exec(select(Student).where(Student.roll_number == roll_number.upper())).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    image = qrcode.make(student.qr_token)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/png")


@app.post("/api/scan", response_model=ScanResponse)
def scan(
    payload: ScanRequest,
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
) -> ScanResponse:
    digest = hashlib.sha256(payload.qr_token.encode("utf-8")).hexdigest()
    students = session.exec(select(Student)).all()
    matched = next(
        (
            item
            for item in students
            if hashlib.sha256(item.qr_token.encode()).hexdigest() == digest
        ),
        None,
    )
    if matched is None:
        raise HTTPException(status_code=404, detail="Unrecognized student QR token")

    event = ScanEvent(
        student_id=matched.id or 0,
        action=payload.action,
        device=payload.device,
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    message_map = {
        "identify": "Student identity verified.",
        "checkin": "Check-in recorded successfully.",
        "checkout": "Check-out recorded successfully.",
    }
    return ScanResponse(
        success=True,
        message=message_map[payload.action],
        action=payload.action,
        student=to_student_response(matched),
        scanned_at=event.scanned_at,
    )


@app.get("/api/attendance", response_model=list[AttendanceResponse])
def attendance(
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
) -> list[AttendanceResponse]:
    return attendance_rows(session)


@app.get("/api/activity", response_model=list[ActivityResponse])
def activity(
    _: Annotated[dict[str, str], Depends(require_user)],
    session: Session = Depends(get_session),
    limit: int = Query(default=30, ge=1, le=100),
) -> list[ActivityResponse]:
    events = session.exec(
        select(ScanEvent).order_by(ScanEvent.scanned_at.desc()).limit(limit)
    ).all()
    students = {item.id: item for item in session.exec(select(Student)).all()}
    result: list[ActivityResponse] = []
    for event in events:
        student = students.get(event.student_id)
        if student is None:
            continue
        result.append(
            ActivityResponse(
                id=event.id or 0,
                roll_number=student.roll_number,
                student_name=student.name,
                action=event.action,
                device=event.device,
                scanned_at=event.scanned_at,
            )
        )
    return result
