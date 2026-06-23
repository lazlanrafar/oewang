from app.core.currency import format_currency


def _settings(code, pos, decimals):
    return {
        "main_currency_code": code,
        "main_currency_symbol": "Rp" if code == "IDR" else "$",
        "main_currency_symbol_position": pos,
        "main_currency_decimal_places": decimals,
    }


def test_idr_front_with_spacing():
    assert format_currency(1_500_000, _settings("IDR", "Front", 0)) == "IDR 1,500,000"


def test_back_position():
    assert format_currency(1_500_000, _settings("IDR", "Back", 0)) == "1,500,000 IDR"


def test_negative_and_decimals():
    assert format_currency(-1234.5, _settings("USD", "Front", 2)) == "-USD 1,234.50"


def test_default_when_no_settings():
    assert format_currency(1000) == "USD 1,000.00"
