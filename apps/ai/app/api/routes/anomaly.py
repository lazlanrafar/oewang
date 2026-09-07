from fastapi import APIRouter

from app.modules.anomaly.service import detect, detect_candidates
from app.schemas.anomaly import (
    Anomaly,
    AnomalyCandidatesRequest,
    AnomalyCandidatesResponse,
    AnomalyRequest,
    AnomalyResponse,
    CandidateAnomaly,
)

router = APIRouter(tags=["anomaly"])


@router.post("/anomaly", response_model=AnomalyResponse)
async def post_anomaly(req: AnomalyRequest) -> AnomalyResponse:
    anomalies = await detect(req.workspace_id)
    return AnomalyResponse(anomalies=[Anomaly(**a) for a in anomalies])


@router.post("/anomaly/candidates", response_model=AnomalyCandidatesResponse)
async def post_anomaly_candidates(
    req: AnomalyCandidatesRequest,
) -> AnomalyCandidatesResponse:
    """Score NEW candidate rows (e.g. an in-flight CSV import) against the
    workspace's existing history — distinct from /anomaly, which scans
    already-persisted transactions for the scheduled workspace-wide job."""
    anomalies = await detect_candidates(
        req.workspace_id, [c.model_dump() for c in req.candidates]
    )
    return AnomalyCandidatesResponse(
        anomalies=[CandidateAnomaly(**a) for a in anomalies]
    )
