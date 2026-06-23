from app.modules.anomaly import model


def test_isolation_forest_flags_planted_outlier():
    amounts = [10_000.0] * 12 + [5_000_000.0]
    dows = [1] * 13
    cats = [0] * 13
    out = model.detect_outliers(amounts, dows, cats)
    assert out[-1] is True


def test_too_few_points_returns_no_outliers():
    assert model.detect_outliers([1.0, 2.0], [0, 1], [0, 0]) == [False, False]


def test_category_spike_detected():
    spikes = model.category_spikes(
        {"🍜 Food": 300_000.0}, {"🍜 Food": [100_000.0, 120_000.0]}
    )
    assert any(s["category"] == "🍜 Food" for s in spikes)


def test_no_spike_when_stable():
    spikes = model.category_spikes(
        {"🍜 Food": 110_000.0}, {"🍜 Food": [100_000.0, 120_000.0]}
    )
    assert spikes == []
