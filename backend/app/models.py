from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Student(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    roll_number: str = Field(index=True, unique=True)
    name: str
    department: str
    class_name: str
    year: int
    email: str
    phone: str = ""
    qr_token: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ScanEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    action: str = Field(index=True)  # identify | checkin | checkout
    device: str = "browser-camera"
    scanned_at: datetime = Field(default_factory=datetime.utcnow, index=True)
