"""Capability port tests: chunking math + file extraction (pure), and receipt /
import structured-output shape (OpenAI mocked — no network)."""

import base64
import json

import app.modules.imports.service as imports_svc
import app.modules.receipt.service as receipt_svc
from app.modules.vault import chunking


def test_is_indexable_matches_supported_types():
    assert chunking.is_indexable("application/pdf")
    assert chunking.is_indexable("text/plain")
    assert chunking.is_indexable(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert not chunking.is_indexable("image/png")


def test_chunk_overlaps_and_indexes_sequentially():
    text = "word " * 600  # ~3000 chars → multiple 1000-char chunks
    chunks = chunking.chunk(text)
    assert len(chunks) >= 3
    assert [c["index"] for c in chunks] == list(range(len(chunks)))
    assert all(c["tokenCount"] > 0 for c in chunks)


def test_chunk_empty_text_is_no_chunks():
    assert chunking.chunk("   \n\n  ") == []


def test_extract_text_decodes_csv():
    raw = base64.b64encode(b"a,b\n1,2\n").decode()
    assert "a,b" in chunking.extract_text(raw, "text/csv")


def test_extract_text_returns_none_for_images():
    raw = base64.b64encode(b"\x89PNG").decode()
    assert chunking.extract_text(raw, "image/png") is None


class _FakeMsg:
    def __init__(self, content):
        self.message = type("M", (), {"content": content})()


class _FakeResp:
    def __init__(self, content):
        self.choices = [_FakeMsg(content)]


class _FakeClient:
    def __init__(self, content):
        self._content = content

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, **kwargs):
        return _FakeResp(self._content)


def test_parse_receipt_returns_structured_dict(monkeypatch):
    payload = {"amount": 42.0, "date": "2026-06-23T00:00:00.000Z", "name": "Toko",
               "categoryId": "cat1", "items": []}
    monkeypatch.setattr(receipt_svc, "get_client", lambda: _FakeClient(json.dumps(payload)))
    monkeypatch.setattr(receipt_svc.get_settings(), "OPENAI_API_KEY", "x", raising=False)
    out = receipt_svc.parse_receipt(base64.b64encode(b"img").decode(), "image/jpeg", "cat1: Food")
    assert out["amount"] == 42.0
    assert out["name"] == "Toko"


def test_extract_transactions_returns_list(monkeypatch):
    payload = {"transactions": [
        {"name": "Coffee", "amount": 5, "date": "2026-06-01", "type": "expense",
         "walletName": "Cash", "categoryName": "Food", "description": None}
    ]}
    monkeypatch.setattr(imports_svc, "get_client", lambda: _FakeClient(json.dumps(payload)))
    monkeypatch.setattr(imports_svc.get_settings(), "OPENAI_API_KEY", "x", raising=False)
    out = imports_svc.extract_transactions([{"date": "2026-06-01", "amt": "5"}], ["Cash"], ["Food"])
    assert len(out) == 1
    assert out[0]["name"] == "Coffee"
