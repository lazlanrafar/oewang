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
        self.usage = None


class _FakeClient:
    def __init__(self, content):
        self._content = content
        self.last_kwargs = None

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return _FakeResp(self._content)


def test_parse_receipt_returns_structured_dict(monkeypatch):
    payload = {"amount": 42.0, "date": "2026-06-23T00:00:00.000Z", "name": "Toko",
               "categoryId": "cat1", "items": []}
    monkeypatch.setattr(receipt_svc, "get_client", lambda: _FakeClient(json.dumps(payload)))
    monkeypatch.setattr(receipt_svc.get_settings(), "OPENAI_API_KEY", "x", raising=False)
    out, usage = receipt_svc.parse_receipt(base64.b64encode(b"img").decode(), "image/jpeg", "cat1: Food")
    assert out["amount"] == 42.0
    assert out["name"] == "Toko"
    assert set(usage) == {"input_tokens", "output_tokens"}


def test_parse_receipt_uses_vision_model_and_detail(monkeypatch):
    payload = {"amount": 1.0, "date": "2026-06-23T00:00:00.000Z", "name": "X",
               "categoryId": None, "items": []}
    client = _FakeClient(json.dumps(payload))
    monkeypatch.setattr(receipt_svc, "get_client", lambda: client)
    monkeypatch.setattr(receipt_svc.get_settings(), "OPENAI_API_KEY", "x", raising=False)
    receipt_svc.parse_receipt(base64.b64encode(b"img").decode(), "image/jpeg", "")
    settings = receipt_svc.get_settings()
    assert client.last_kwargs["model"] == settings.AI_VISION_MODEL
    image_part = client.last_kwargs["messages"][1]["content"][1]
    assert image_part["image_url"]["detail"] == settings.AI_RECEIPT_DETAIL


def test_downscale_shrinks_oversized_image():
    import io as _io

    from PIL import Image

    buf = _io.BytesIO()
    Image.new("RGB", (3000, 4000), "white").save(buf, format="JPEG")
    out_b64, out_mime = receipt_svc._downscale(
        base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
    )
    out = Image.open(_io.BytesIO(base64.b64decode(out_b64)))
    assert max(out.size) <= receipt_svc._MAX_IMAGE_DIM
    assert out_mime == "image/jpeg"


def test_downscale_passes_small_and_garbage_through():
    import io as _io

    from PIL import Image

    buf = _io.BytesIO()
    Image.new("RGB", (400, 800), "white").save(buf, format="PNG")
    small_b64 = base64.b64encode(buf.getvalue()).decode()
    assert receipt_svc._downscale(small_b64, "image/png") == (small_b64, "image/png")

    garbage = base64.b64encode(b"not an image").decode()
    assert receipt_svc._downscale(garbage, "image/jpeg") == (garbage, "image/jpeg")


def test_extract_transactions_returns_list(monkeypatch):
    payload = {"transactions": [
        {"name": "Coffee", "amount": 5, "date": "2026-06-01", "type": "expense",
         "walletName": "Cash", "categoryName": "Food", "description": None}
    ]}
    monkeypatch.setattr(imports_svc, "get_client", lambda: _FakeClient(json.dumps(payload)))
    monkeypatch.setattr(imports_svc.get_settings(), "OPENAI_API_KEY", "x", raising=False)
    out, usage = imports_svc.extract_transactions([{"date": "2026-06-01", "amt": "5"}], ["Cash"], ["Food"])
    assert len(out) == 1
    assert out[0]["name"] == "Coffee"
    assert set(usage) == {"input_tokens", "output_tokens"}
