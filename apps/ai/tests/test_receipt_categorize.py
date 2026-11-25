"""`POST /receipt/categorize` (D86).

A saved Telegram receipt's merchant and item names, filed under one of the
workspace's expense categories. The tests are about what the answer may
be: one of the names it was shown, exactly, or nothing. And like every
call that reads text somebody else printed, it has no tools.
"""

from __future__ import annotations

import json
from typing import Any

from app.core import model
from app.modules.extraction.categorize import clean_category, clean_items
from tests.extraction_support import Answer, ScriptedClient, assert_no_tools
from tests.support import Owe1TestClient

CATEGORIES = ["🍜 Food", "🛍️ Shopping", "🧾 Bills", "🛵 Transport", "📦 Other"]


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "request_id": "01JC0TESTREQUEST",
        "workspace_id": "clxworkspace1",
        "merchant": "HOLAN BY MEVUI",
        "items": ["MINERAL WATER (Bottle)", "PHO SG - SPECIAL", "SPRITE"],
        "categories": CATEGORIES,
    }
    body.update(overrides)
    return body


def call(client: Owe1TestClient, **overrides: Any) -> dict:
    return client.call("POST", "/receipt/categorize", body=payload(**overrides))


def answer(category: Any) -> Answer:
    return Answer(text=json.dumps({"category": category}))


def test_a_category_it_was_shown_comes_back(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    body = call(owe1_client)

    assert body["data"]["category"] == "🍜 Food"
    assert body["data"]["usage"]["input"] == 100, "what the call cost, for the ledger (D92)"
    assert_no_tools(scripted)


# TG-7
def test_a_category_it_was_not_shown_is_dropped(owe1_client: Owe1TestClient) -> None:
    """Rule 1. A reworded or invented name would not match an id in the
    API, so it never leaves here."""
    scripted = ScriptedClient(answer("Food & Drinks"))
    model.set_model_client(scripted)

    assert call(owe1_client)["data"]["category"] is None


def test_null_is_an_answer(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(answer(None)))

    assert call(owe1_client)["data"]["category"] is None


def test_no_categories_means_no_call(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    body = call(owe1_client, categories=[])

    assert body["data"]["category"] is None
    assert scripted.calls == []


def test_an_answer_that_is_not_json_is_a_refusal(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(Answer(text="Food, probably")))

    response, request_id = owe1_client.request("POST", "/receipt/categorize", body=payload())
    body = owe1_client.open_response(response, request_id)

    assert response.status_code == 422
    assert body["error"]["code"] == "CATEGORIZE_FAILED"


# TG-7
def test_the_model_sees_strings_and_no_document(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(answer("🍜 Food"))
    model.set_model_client(scripted)

    call(owe1_client)

    content = scripted.calls[0]["messages"][0]["content"]
    assert isinstance(content, str), "the image never reaches this call"
    assert json.loads(content)["categories"] == CATEGORIES


# TG-7
def test_clean_category_keeps_only_an_exact_name() -> None:
    assert clean_category({"category": " 🍜 Food "}, CATEGORIES) == "🍜 Food"
    assert clean_category({"category": "food"}, CATEGORIES) is None
    assert clean_category({"category": 3}, CATEGORIES) is None
    assert clean_category({}, CATEGORIES) is None


# ---------------------------------------------------------------- per item
# TXN-27: one category per item, from the list it was given.

ITEMS = ["BERAS 5KG", "SAMPOERNA MILD 16", "PCT 500MG"]
ITEM_CATEGORIES = ["🛒 Groceries", "🚬 Cigarettes", "💊 Health"]


def call_items(client: Owe1TestClient, **overrides: Any) -> dict:
    return call(
        client,
        **{"items": ITEMS, "categories": ITEM_CATEGORIES, "per_item": True, **overrides},
    )


def items_answer(items: Any) -> Answer:
    return Answer(text=json.dumps({"items": items}))


def test_every_item_gets_a_category_from_the_list(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(
        items_answer({"1": "🛒 Groceries", "2": "🚬 Cigarettes", "3": "💊 Health"})
    )
    model.set_model_client(scripted)

    body = call_items(owe1_client)

    assert body["data"]["items"] == ["🛒 Groceries", "🚬 Cigarettes", "💊 Health"]
    assert body["data"]["category"] is None
    assert body["data"]["usage"]["input"] == 100, "what the call cost, for the ledger (D92)"
    # D24: the item names were printed by somebody else.
    assert_no_tools(scripted)


def test_an_unknown_a_missing_and_an_unsure_item_are_empty(owe1_client: Owe1TestClient) -> None:
    """An invented name, a line the model skipped and a null all leave the
    item without a category; the ones beside them are kept."""
    model.set_model_client(ScriptedClient(items_answer({"1": "Rice & Grains", "3": None})))
    assert call_items(owe1_client)["data"]["items"] == [None, None, None]

    model.set_model_client(ScriptedClient(items_answer({"2": "🚬 Cigarettes", "9": "💊 Health"})))
    assert call_items(owe1_client)["data"]["items"] == [None, "🚬 Cigarettes", None]


def test_an_answer_in_another_shape_is_empty_for_every_item(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(items_answer(["🛒 Groceries"])))
    assert call_items(owe1_client)["data"]["items"] == [None, None, None]

    model.set_model_client(ScriptedClient(answer("🛒 Groceries")))
    assert call_items(owe1_client)["data"]["items"] == [None, None, None]


def test_no_items_or_no_categories_means_no_call(owe1_client: Owe1TestClient) -> None:
    scripted = ScriptedClient(items_answer({"1": "🛒 Groceries"}))
    model.set_model_client(scripted)

    assert call_items(owe1_client, categories=[])["data"]["items"] == [None, None, None]
    assert call_items(owe1_client, items=[])["data"]["items"] == []
    assert scripted.calls == []


def test_the_items_reach_the_model_numbered_and_without_tools(
    owe1_client: Owe1TestClient,
) -> None:
    scripted = ScriptedClient(items_answer({}))
    model.set_model_client(scripted)

    call_items(owe1_client)

    content = scripted.calls[0]["messages"][0]["content"]
    assert isinstance(content, str), "the image never reaches this call"
    sent = json.loads(content)
    assert sent["items"] == {"1": ITEMS[0], "2": ITEMS[1], "3": ITEMS[2]}
    assert sent["categories"] == ITEM_CATEGORIES
    assert_no_tools(scripted)


def test_the_receipt_answer_is_unchanged_without_the_flag(owe1_client: Owe1TestClient) -> None:
    model.set_model_client(ScriptedClient(answer("🍜 Food")))

    data = call(owe1_client)["data"]

    assert data["category"] == "🍜 Food"
    assert data["items"] == []


def test_clean_items_keeps_only_exact_names_in_order() -> None:
    answers = {"items": {"1": " 🛒 Groceries ", "2": "cigarettes", "3": 7}}
    assert clean_items(answers, 4, ITEM_CATEGORIES) == ["🛒 Groceries", None, None, None]
    assert clean_items({}, 2, ITEM_CATEGORIES) == [None, None]
