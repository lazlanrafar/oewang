import numpy as np
from sklearn.ensemble import IsolationForest

# ponytail: fit-per-request, no persistence. Fine at this data scale;
# persist + schedule retrain if fitting per call ever gets slow.
_MIN_POINTS = 8


def detect_outliers(
    amounts: list[float], dows: list[int], cat_codes: list[int]
) -> list[bool]:
    """IsolationForest over (amount, day-of-week, category). True = anomalous."""
    if len(amounts) < _MIN_POINTS:
        return [False] * len(amounts)
    x = np.column_stack([amounts, dows, cat_codes]).astype(float)
    preds = IsolationForest(contamination="auto", random_state=42).fit_predict(x)
    return [bool(p == -1) for p in preds]


def category_spikes(
    current: dict[str, float],
    history: dict[str, list[float]],
    pct: float = 0.5,
    min_delta: float = 50_000.0,
) -> list[dict]:
    """Categories whose current spend jumped >=pct AND >=min_delta over their average."""
    spikes = []
    for cat, cur in current.items():
        past = history.get(cat, [])
        if not past:
            continue
        avg = sum(past) / len(past)
        if avg > 0 and cur >= avg * (1 + pct) and (cur - avg) >= min_delta:
            spikes.append({"category": cat, "current": cur, "avg": avg})
    return spikes
