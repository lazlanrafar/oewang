import app.modules.advisor.service as svc


async def test_advise_dedups_and_sorts_sources(monkeypatch):
    async def fake_search(q, **kw):
        return [
            {"source": "tax_id.md", "content": "a", "similarity": 0.9},
            {"source": "finance.md", "content": "b", "similarity": 0.8},
            {"source": "tax_id.md", "content": "c", "similarity": 0.7},
        ]

    async def fake_currency(ws):
        return None

    async def fake_profile(ws, currency):
        return ""

    monkeypatch.setattr(svc, "search", fake_search)
    monkeypatch.setattr(svc, "get_currency_settings", fake_currency)
    monkeypatch.setattr(svc, "_spending_profile", fake_profile)
    monkeypatch.setattr(svc.llm, "complete", lambda *a, **k: "Jawaban.")

    res = await svc.advise("pajak umkm", "w1")
    assert res["answer"] == "Jawaban."
    assert res["sources"] == ["finance.md", "tax_id.md"]
