from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_service_starts_without_a_database_url(monkeypatch) -> None:
    """The AI service must never be given DATABASE_URL (D3, PLT-3)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from app.config import Settings

    assert not hasattr(Settings(), "database_url")
