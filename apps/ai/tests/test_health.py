import pytest
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

    settings = Settings()
    assert not hasattr(settings, "database_url")
    settings.validate_for_environment()


def test_credentials_this_process_must_not_hold_stop_it_starting(monkeypatch) -> None:
    """Nothing here reads them, but a process handed one is misconfigured
    whether it reads it or not (D3, D4)."""
    from app.config import FORBIDDEN_VARIABLES, Settings

    for name in FORBIDDEN_VARIABLES:
        for other in FORBIDDEN_VARIABLES:
            monkeypatch.delenv(other, raising=False)
        monkeypatch.setenv(name, "something")

        with pytest.raises(ValueError, match=name):
            Settings().validate_for_environment()
