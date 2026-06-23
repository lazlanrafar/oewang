from pydantic import BaseModel, Field


class AnomalyRequest(BaseModel):
    workspace_id: str = Field(min_length=1)


class Anomaly(BaseModel):
    transaction_id: str | None = None
    category: str
    reason: str
    severity: str


class AnomalyResponse(BaseModel):
    anomalies: list[Anomaly]
