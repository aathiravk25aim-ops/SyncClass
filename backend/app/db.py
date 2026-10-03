import os
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB = f"sqlite:///{BASE_DIR / 'studentid.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
