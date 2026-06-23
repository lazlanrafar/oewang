from fastapi import APIRouter

from app.modules.advisor.service import advise
from app.schemas.advisor import AdvisorRequest, AdvisorResponse

router = APIRouter(tags=["advisor"])

@router.post("/advisor", response_model=AdvisorResponse)
async def post_advisor(req: AdvisorRequest) -> AdvisorResponse:
    result = await advise(req.question, req.workspace_id)
    return AdvisorResponse(**result)
