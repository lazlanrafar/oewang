# Data Analysis, Visualization & Pipelines — Python Developer Reference

Source: [roadmap.sh/python-data-analysis](https://roadmap.sh/python-data-analysis)

---

## 1. Vectorized Computing with NumPy

- **Never iterate over numerical arrays with Python `for` loops**. Use vectorized ufuncs and broadcasting.
- Use `np.random.default_rng(seed)` (modern Generator API), not legacy global `np.random.seed()`.

```python
import numpy as np

rng = np.random.default_rng(42)
data = rng.normal(loc=100.0, scale=15.0, size=(1000, 4))

# Vectorized per-column z-score normalization via broadcasting
mean = data.mean(axis=0)
std = data.std(axis=0)
z_scores = (data - mean) / std

# Boolean masking & IQR outlier filtering
q25, q75 = np.percentile(data[:, 0], [25, 75])
iqr = q75 - q25
clean_rows = data[(data[:, 0] >= q25 - 1.5 * iqr) & (data[:, 0] <= q75 + 1.5 * iqr)]
```

---

## 2. DataFrame Manipulation: Polars vs. Pandas 2.x

- **New projects / large datasets**: Prefer **Polars** (multi-threaded, lazy query optimizer, Apache Arrow memory model).
- **Existing codebases / classic scikit-learn integration**: Use **Pandas 2.x** with PyArrow dtypes (`dtype_backend="pyarrow"`).
- Avoid `.iterrows()` and row-wise `.apply(..., axis=1)` in both Polars and Pandas — always express logic as columnar expressions.

```python
import polars as pl

# Lazy query evaluation (automatic predicate & projection pushdown)
q = (
    pl.scan_parquet("s3://bucket/transactions/*.parquet")
    .filter(pl.col("status") == "completed")
    .with_columns(
        (pl.col("price") * pl.col("qty")).alias("revenue"),
        pl.col("created_at").dt.truncate("1d").alias("day"),
    )
    .group_by("day", "category")
    .agg(
        pl.len().alias("tx_count"),
        pl.col("revenue").sum().alias("total_revenue"),
        pl.col("revenue").quantile(0.95).alias("p95_revenue"),
    )
    .sort("day", descending=True)
)
df = q.collect()
```

### Pandas 2.x Idiomatic Method Chaining
```python
import pandas as pd

df = (
    pd.read_parquet("sales.parquet", dtype_backend="pyarrow")
    .query("amount > 0")
    .assign(
        month=lambda x: x["date"].dt.to_period("M"),
        net=lambda x: x["amount"] * (1 - x["discount"]),
    )
    .groupby(["month", "region"], as_index=False)
    .agg(total_net=("net", "sum"), orders=("id", "count"))
)
```

---

## 3. Exploratory Data Analysis (EDA) & Statistical Checks

1. **Initial Inspection**: Verify schema/dtypes, missing-value ratios (`null_count()`), categorical cardinality, and primary-key duplicates.
2. **Distributions & Outliers**:
   - Report **Median + IQR** for skewed distributions, and **Mean + SD** for near-normal distributions.
   - Compute **Correlation Matrices** (Pearson for linear, Spearman for monotonic non-linear relationships) and **Cross-tabulations** (`pd.crosstab`) for categorical variables.
3. **Data Leakage Prevention**: Always perform `train_test_split` (or chronological split for time series) **before** computing imputation, scaling (`StandardScaler`), or target-encoding statistics.

---

## 4. Data Visualization & Dashboards

| Use Case | Primary Tool | Best Practice |
|----------|--------------|---------------|
| **Static / Publication Plots** | `Matplotlib` + `Seaborn` | Use the OO API (`fig, ax = plt.subplots()`), never stateful `plt.plot()` |
| **Interactive Exploration** | `Plotly Express` / `Altair` | Ideal for hover inspection, zooming time series, and web embedding |
| **Internal Data Apps / Dashboards** | `Streamlit` / `Plotly Dash` | Cache queries/DataFrames with `@st.cache_data` and DB/ML resources with `@st.cache_resource` |

```python
import matplotlib.pyplot as plt
import seaborn as sns

fig, ax = plt.subplots(figsize=(8, 5), dpi=150)
sns.regplot(data=df, x="spend", y="revenue", ax=ax)
ax.set(title="Revenue vs. Ad Spend", xlabel="Spend (USD)", ylabel="Revenue (USD)")
fig.tight_layout()
fig.savefig("revenue_vs_spend.png")
plt.close(fig)
```

---

## 5. Big Data & Data Pipelines

- **Single-node out-of-core (10 GB – 500 GB)**: Use **DuckDB** or **Polars Lazy (`sink_parquet`)** before introducing distributed cluster overhead.
- **Distributed cluster (>500 GB)**: Use **PySpark** or **Dask**.
- **Orchestration (Airflow / Dagster / Prefect)**:
  - **Mandatory Idempotency**: Re-running a task for the same `logical_date` partition must produce identical output without duplicate rows (use `INSERT OVERWRITE`, `MERGE`, or partition overwrite).
  - Never pass large DataFrames between tasks via XCom; store **Parquet** in object storage (S3/GCS) and pass only the URI.
