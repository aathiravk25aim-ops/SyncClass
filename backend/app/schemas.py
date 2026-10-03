from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    username: str
    role: Literal["admin", "faculty"]


class StudentCreate(BaseModel):
    roll_number: str
    name: str
    department: str
    class_name: str
    year: int = Field(ge=1, le=6)
    email: str
    phone: str = ""


class StudentResponse(BaseModel):
    id: int
    roll_number: str
    name: str
    department: str
    class_name: str
    year: int
    email: str
    phone: str
    created_at: datetime


class ScanRequest(BaseModel):
    qr_token: str = Field(min_length=8)
    action: Literal["identify", "checkin", "checkout"] = "identify"
    device: str = "browser-camera"


class ScanResponse(BaseModel):
    success: bool
    message: str
    action: str
    student: StudentResponse | None = None
    scanned_at: datetime | None = None


class ActivityResponse(BaseModel):
    id: int
    roll_number: str
    student_name: str
    action: str
    device: str
    scanned_at: datetime


class DashboardResponse(BaseModel):
    total_students: int
    scans_today: int
    checkins_today: int
    checkouts_today: int
    identified_today: int
    active_students_estimate: int
    present_today: int
    late_today: int
    absent_today: int
    attendance_rate: int


class AttendanceResponse(BaseModel):
    roll_number: str
    student_name: str
    department: str
    class_name: str
    status: Literal["Present", "Late", "Absent"]
    checkin_time: datetime | None = None
    checkout_time: datetime | None = None
