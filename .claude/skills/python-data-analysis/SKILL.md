---
name: python-data-analysis
description: >-
  Python Data Analysis, Visualization, and Data Engineering skill based on roadmap.sh/python-data-analysis.
  Enforces vectorized NumPy, Polars/Pandas 2.x (PyArrow), rigorous EDA (IQR, correlation, leakage prevention),
  publication-grade Matplotlib/Seaborn/Plotly visualizations, Streamlit/Dash apps, and idempotent DuckDB/PySpark/Airflow pipelines.
  Use whenever analyzing datasets, cleaning data, building charts/dashboards, or designing data pipelines in Python.
---

# Python Data Analysis Skill

Guidelines for data manipulation, statistical exploration, visualization, and data pipelines based on [roadmap.sh/python-data-analysis](https://roadmap.sh/python-data-analysis).

> **Deep reference**: [`../python-developer/references/data-analysis-and-pipelines.md`](../python-developer/references/data-analysis-and-pipelines.md)

---

## 1. Golden Rules of Data Manipulation (NumPy, Polars, Pandas)

1. **Vectorization Over Loops**: Never use Python `for` loops, `.iterrows()`, or `.apply(axis=1)` for numeric or string column operations. Use vectorized expressions and broadcasting.
2. **Polars / DuckDB First for Modern Workloads**:
   - Prefer **Polars** (`scan_parquet` + lazy expressions) or **DuckDB** for fast, multi-threaded, memory-efficient data processing.
   - When using **Pandas 2.x**, enable `dtype_backend="pyarrow"` and use method chaining (`.assign()`, `.query()`, `.pipe()`) instead of in-place mutations that trigger `SettingWithCopyWarning`.
3. **Storage Formats**: Use **Parquet** (or Arrow IPC) for intermediate and analytical storage. Avoid CSV for datasets >50 MB due to missing schema metadata and slow parsing.
4. **Reproducibility**: Always seed random generators explicitly via `rng = np.random.default_rng(42)`.

---

## 2. Exploratory Data Analysis (EDA) Protocol

Execute these checks in order when inspecting any dataset:
1. **Schema & Integrity Check**: Shape `(rows, cols)`, column dtypes, primary-key uniqueness, and missing-value ratios per column.
2. **Distributions & Outliers**:
   - Report **Mean + SD** for symmetric distributions, and **Median + IQR** (`Q75 - Q25`) for skewed distributions.
   - Detect outliers via IQR bounds (`[Q25 - 1.5*IQR, Q75 + 1.5*IQR]`) or Z-scores (`|z| > 3`). Never drop outliers blindly without verifying whether they represent data errors or genuine tail events.
3. **Relationships & Correlations**:
   - Numeric vs. Numeric: **Pearson** (linear) and **Spearman** (monotonic rank) correlation matrices.
   - Categorical vs. Categorical: **Cross-tabulation** (`crosstab`) and Chi-Square tests where appropriate.
4. **Data Leakage Prevention**: Always split into train/validation/test sets **before** fitting imputers, scalers, or target encoders. Use **time-based splitting** for temporal datasets.

---

## 3. Data Visualization & Dashboards

- **Matplotlib / Seaborn**: Always use the Object-Oriented API (`fig, ax = plt.subplots()`), label axes with units, include a descriptive title, and close figures (`plt.close(fig)`) after saving.
- **Plotly Express**: Use for interactive exploration (multi-metric time series, hover inspection).
- **Streamlit / Dash**:
  - Separate pure data transformation functions from UI layout code.
  - Cache data loads with `@st.cache_data` and DB connections / ML models with `@st.cache_resource`.

---

## 4. Big Data & Pipeline Engineering

- **Scale Up Before Scaling Out**: A single node running **DuckDB** or **Polars streaming** processes 10–250 GB of Parquet faster and cheaper than a small distributed cluster.
- **PySpark / Dask**: Use when dataset size exceeds single-node memory/disk. Avoid row-by-row Python UDFs in PySpark; use built-in `pyspark.sql.functions` or Pandas/Arrow Vectorized UDFs.
- **Airflow / Dagster**:
  - Every task must be **idempotent** and **atomic** (safe to re-run for any `logical_date` without duplicating rows).
  - Never pass large DataFrames through orchestrator metadata DBs (XCom); write Parquet to object storage (S3/GCS/local) and pass the URI.
