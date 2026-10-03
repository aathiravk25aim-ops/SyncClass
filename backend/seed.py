import secrets
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.db import engine, init_db
from app.models import ScanEvent, Student

NAMES = [
    "Aathira V K", "Arun Kumar", "Meena Priya", "Rahul Dev", "Ananya S", "Aditya Raj",
    "Akshaya M", "Aravind S", "Bhavya R", "Bharath K", "Chandru P", "Dharani V",
    "Deepak S", "Divya R", "Dinesh Kumar", "Harini M", "Hari Prasad", "Ishwarya K",
    "Jeeva S", "Karthik R", "Keerthana P", "Krishna V", "Lavanya S", "Lokesh M",
    "Manoj K", "Monisha R", "Nandhini S", "Naveen P", "Nikhil R", "Pavithra K",
    "Pranav S", "Priya Dharshini", "Rahul S", "Ranjith K", "Reshma P", "Rithika S",
    "Rohit M", "Sanjay V", "Saranya R", "Shalini P", "Shreya K", "Siddharth S",
    "Sneha M", "Sowmya R", "Surya P", "Swetha K", "Tamilselvan R", "Varsha S",
    "Vignesh K", "Yamini P",
]


def build_students():
    rows = []
    for i, name in enumerate(NAMES, start=1):
        rows.append({
            "roll_number": f"25ALR{i:03d}",
            "name": name,
            "department": "AI & Data Science",
            "class_name": "III ADS",
            "year": 3,
            "email": f"student{i:03d}@example.edu",
            "phone": f"900000{i:04d}",
        })
    return rows


SAMPLE_STUDENTS = build_students()


def main() -> None:
    init_db()
    with Session(engine) as session:
        created = []
        for payload in SAMPLE_STUDENTS:
            existing = session.exec(
                select(Student).where(Student.roll_number == payload["roll_number"])
            ).first()
            if existing:
                created.append(existing)
                continue
            student = Student(**payload, qr_token=secrets.token_urlsafe(24))
            session.add(student)
            session.flush()
            created.append(student)
        session.commit()

        # Add a clean demo attendance distribution for today only if no events exist yet.
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        existing_today = session.exec(
            select(ScanEvent).where(ScanEvent.scanned_at >= today_start)
        ).first()
        if existing_today is None:
            now = datetime.utcnow()
            # 32 Present, 5 Late, 13 Absent = 50 students.
            for index, student in enumerate(created[:37]):
                if index < 32:
                    checkin = now.replace(hour=9, minute=0, second=0, microsecond=0) - timedelta(minutes=index % 8)
                else:
                    checkin = now.replace(hour=9, minute=25, second=0, microsecond=0) + timedelta(minutes=index - 32)
                session.add(ScanEvent(student_id=student.id or 0, action="checkin", scanned_at=checkin))

            # Give the first 8 students a check-out event so the activity log looks realistic.
            for index, student in enumerate(created[:8]):
                checkout = now.replace(hour=16, minute=45, second=0, microsecond=0) - timedelta(minutes=index * 3)
                session.add(ScanEvent(student_id=student.id or 0, action="checkout", scanned_at=checkout))

            session.commit()

    print(f"Seed complete: {len(SAMPLE_STUDENTS)} synthetic department students loaded.")
    print("Attendance demo: 32 Present, 5 Late, 13 Absent.")


if __name__ == "__main__":
    main()
