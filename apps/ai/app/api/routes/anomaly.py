from fastapi import APIRouter

from app.modules.anomaly.service import detect
from app.schemas.anomaly import Anomaly, AnomalyRequest, AnomalyResponse

router = APIRouter(tags=["anomaly"])


@router.post("/anomaly", response_model=AnomalyResponse)
async def post_anomaly(req: AnomalyRequest) -> AnomalyResponse:
    anomalies = await detect(req.workspace_id)
    return AnomalyResponse(anomalies=[Anomaly(**a) for a in anomalies])
