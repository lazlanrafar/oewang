from app.modules.analyzer.service import classify_results
from app.schemas.analyzer import AnalyzeItem

_VALID = {"🍜 Food", "🚕 Transport", "Other"}


def test_invalid_category_falls_back_to_other():
    items = [AnalyzeItem(description="beli sesuatu", amount=25_000)]
    parsed = [{"index": 0, "category": "NotARealCategory", "merchant": "X",
               "intent": "expense", "sentiment": "neutral"}]
    out = classify_results(items, parsed, _VALID)
    assert out[0]["category"] == "Other"
    assert out[0]["merchant"] == "X"


def test_valid_category_passes_through():
    items = [AnalyzeItem(description="makan siang", amount=20_000)]
    parsed = [{"index": 0, "category": "🍜 Food", "merchant": "Warteg",
               "intent": "expense", "sentiment": "neutral"}]
    out = classify_results(items, parsed, _VALID)
    assert out[0]["category"] == "🍜 Food"


def test_missing_index_and_bad_enums_get_defaults():
    items = [AnalyzeItem(description="transfer")]
    out = classify_results(items, [], _VALID)  # nothing parsed
    assert out[0]["category"] == "Other"
    assert out[0]["intent"] == "other"
    assert out[0]["sentiment"] == "neutral"
    assert out[0]["merchant"] is None
