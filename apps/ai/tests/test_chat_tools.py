"""The tool catalog, and the route that serves it.

These pin the half of the contract this service owns against the half the
API owns. The validator is `apps/api/crates/domain/src/tools.rs`; it cannot
be imported from here, so the facts it fixes (the eleven names, the enums,
the bounds, the closed argument objects) are written out below. A change on
either side that is not made on both fails here.
"""

from __future__ import annotations

from typing import Any

from app.modules.chat import tools
from tests.support import Owe1TestClient

#: `Tool::ALL` in apps/api/crates/domain/src/tools.rs, in its order. Eleven,
#: and no twelfth: the catalog is small on purpose (D17).
RUST_TOOL_NAMES = [
    "get_workspace_context",
    "get_recent_transactions",
    "search_transactions",
    "get_spending_summary",
    "create_transaction",
    "update_transaction",
    "delete_transaction",
    "add_transaction_items",
    "create_wallet",
    "create_category",
    "present_choices",
]


def schema(name: str) -> dict[str, Any]:
    definition = tools.TOOLS_BY_NAME[name]
    return definition["input_schema"]


def every_schema() -> list[tuple[str, dict[str, Any]]]:
    """Every argument object in the catalog, including nested ones, so a
    rule about schemas is checked on a line item too."""
    found: list[tuple[str, dict[str, Any]]] = []

    def walk(label: str, node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "object":
            found.append((label, node))
        for key, value in node.get("properties", {}).items():
            walk(f"{label}.{key}", value)
        if "items" in node:
            walk(f"{label}[]", node["items"])

    for definition in tools.TOOL_DEFINITIONS:
        walk(definition["name"], definition["input_schema"])
    return found


def test_every_tool_has_a_name_a_description_and_an_object_schema() -> None:
    for definition in tools.TOOL_DEFINITIONS:
        assert definition.keys() == {"name", "description", "input_schema"}
        assert definition["name"].strip()
        assert len(definition["description"]) > 40, definition["name"]
        assert definition["input_schema"]["type"] == "object"
        assert isinstance(definition["input_schema"]["properties"], dict)


def test_the_catalog_is_exactly_the_eleven_tools_the_api_knows() -> None:
    assert [definition["name"] for definition in tools.TOOL_DEFINITIONS] == RUST_TOOL_NAMES
    assert len(tools.TOOL_DEFINITIONS) == 11
    assert tools.tool_definition("bulk_delete_transactions") is None
    assert tools.tool_definition("delete_wallet") is None


def test_no_money_field_is_typed_as_a_number_anywhere_in_the_catalog() -> None:
    """D12. The API refuses a JSON number in an amount position, so a schema
    that invited one would produce a call that is always refused."""
    seen = set()

    for label, node in every_schema():
        for name, field in node.get("properties", {}).items():
            if name not in tools.MONEY_FIELDS:
                continue
            seen.add(name)
            assert field["type"] == "string", f"{label}.{name}"
            assert "string" in field["description"], f"{label}.{name} does not say so"
            assert "never a JSON number" in field["description"], f"{label}.{name}"

    assert seen == set(tools.MONEY_FIELDS), "a money field was renamed or dropped"


def test_every_schema_refuses_an_argument_it_does_not_declare() -> None:
    for label, node in every_schema():
        assert node.get("additionalProperties") is False, label


def test_every_required_argument_is_one_the_schema_declares() -> None:
    for label, node in every_schema():
        declared = set(node.get("properties", {}))
        for name in node.get("required", []):
            assert name in declared, f"{label} requires {name} but does not declare it"


def test_a_date_argument_asks_for_iso_8601_and_nothing_else() -> None:
    for label, node in every_schema():
        for name, field in node.get("properties", {}).items():
            if name not in {"from", "to", "date"}:
                continue
            assert field["type"] == "string", f"{label}.{name}"
            assert "ISO 8601" in field["description"], f"{label}.{name}"


def test_a_limit_is_a_whole_number_between_one_and_fifty() -> None:
    for name in ("get_recent_transactions", "search_transactions"):
        limit = schema(name)["properties"]["limit"]
        assert limit["type"] == "integer", name
        assert limit["minimum"] == 1, name
        assert limit["maximum"] == 50, name


def test_the_enums_match_the_validator() -> None:
    assert schema("search_transactions")["properties"]["type"]["enum"] == [
        "income",
        "expense",
        "transfer",
    ]
    assert schema("create_transaction")["properties"]["type"]["enum"] == [
        "income",
        "expense",
        "transfer",
    ]
    assert schema("create_category")["properties"]["type"]["enum"] == ["income", "expense"]
    assert schema("get_spending_summary")["properties"]["group_by"]["enum"] == [
        "category",
        "wallet",
        "type",
        "month",
    ]


def test_the_context_tool_takes_no_arguments() -> None:
    assert schema("get_workspace_context") == {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    }


def test_a_write_requires_what_the_api_requires() -> None:
    assert schema("create_transaction")["required"] == ["type", "amount", "wallet_id"]
    assert schema("update_transaction")["required"] == ["transaction_id"]
    assert schema("delete_transaction")["required"] == ["transaction_id"]
    assert schema("add_transaction_items")["required"] == ["transaction_id", "items"]
    assert schema("create_wallet")["required"] == ["name"]
    assert schema("create_category")["required"] == ["name", "type"]
    assert schema("get_spending_summary")["required"] == ["from", "to"]
    assert schema("present_choices")["required"] == ["question", "choices"]


def test_an_update_takes_every_field_a_create_takes() -> None:
    creatable = set(schema("create_transaction")["properties"])
    updatable = set(schema("update_transaction")["properties"])
    assert updatable == creatable | {"transaction_id"}


def test_a_transfer_can_name_the_other_side() -> None:
    fields = schema("create_transaction")["properties"]
    assert "to_wallet_id" in fields
    assert "to_amount" in fields
    # Required on a transfer, which the schema cannot express; the
    # description has to carry it.
    assert "transfer" in tools.TOOLS_BY_NAME["create_transaction"]["description"]
    assert "transfer" in fields["to_amount"]["description"]


def test_creating_a_wallet_does_not_offer_an_opening_balance() -> None:
    """There is no such column. docs/ai/service.md still lists one; the
    column is the authority and the doc is being corrected separately."""
    fields = schema("create_wallet")["properties"]
    assert set(fields) == {"name", "group_id", "currency_code"}
    assert "initial_balance" not in fields


def test_a_list_argument_is_bounded_at_both_ends() -> None:
    items = schema("add_transaction_items")["properties"]["items"]
    assert items["minItems"] == 1
    assert items["maxItems"] == tools.MAX_ITEMS == 50
    assert items["items"]["required"] == ["name", "amount"]

    choices = schema("present_choices")["properties"]["choices"]
    assert choices["minItems"] == 2
    assert choices["maxItems"] == tools.MAX_CHOICES == 10


def test_a_read_tool_says_the_figures_are_already_computed() -> None:
    """D27. The model picks words; it never combines two numbers."""
    summary = tools.TOOLS_BY_NAME["get_spending_summary"]["description"]
    assert "computed" in summary
    assert "arithmetic" in summary


def test_the_endpoint_answers_with_the_catalog(owe1_client: Owe1TestClient) -> None:
    body = owe1_client.call("GET", "/tools/definitions")

    assert body["error"] is None
    assert body["data"] == tools.TOOL_DEFINITIONS
    assert [definition["name"] for definition in body["data"]] == RUST_TOOL_NAMES


def test_the_endpoint_is_sealed_like_every_other_protected_route(
    owe1_client: Owe1TestClient,
) -> None:
    response, _ = owe1_client.request("GET", "/tools/definitions")

    assert response.status_code == 200
    # The catalog is not a secret, but it is not a plaintext exception either.
    assert "get_spending_summary" not in response.text


def test_the_endpoint_requires_the_service_key(http) -> None:
    response = http.get("/tools/definitions")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
