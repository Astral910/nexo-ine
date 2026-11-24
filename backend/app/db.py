"""Conexión a la base de datos (PostgreSQL en producción, SQLite en desarrollo)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import obtener_config


class Base(DeclarativeBase):
    pass


def ahora() -> datetime:
    """Hora UTC sin zona (se guarda igual en SQLite y PostgreSQL)."""
    return datetime.now(UTC).replace(tzinfo=None)


_cfg = obtener_config()
_es_sqlite = _cfg.url_bd.startswith("sqlite")

motor = create_engine(
    _cfg.url_bd,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False, "timeout": 30} if _es_sqlite else {},
)

if _es_sqlite:

    @event.listens_for(motor, "connect")
    def _pragmas(conexion, _registro):  # pragma: no cover - configuración del motor
        cur = conexion.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()


SesionLocal = sessionmaker(bind=motor, autoflush=False, expire_on_commit=False)


def obtener_bd() -> Iterator[Session]:
    bd = SesionLocal()
    try:
        yield bd
    finally:
        bd.close()


def es_postgres() -> bool:
    return motor.dialect.name == "postgresql"
