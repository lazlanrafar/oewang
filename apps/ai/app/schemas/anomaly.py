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


class AnomalyCandidate(BaseModel):
    index: int
    amount: float
    date: str  # ISO 8601
    category: str | None = None


class AnomalyCandidatesRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    candidates: list[AnomalyCandidate] = Field(min_length=1)


class CandidateAnomaly(BaseModel):
    index: int
    reason: str
    severity: str


class AnomalyCandidatesResponse(BaseModel):
    anomalies: list[CandidateAnomaly]
