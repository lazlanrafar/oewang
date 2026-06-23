from fastapi import APIRouter

from app.modules.analyzer.service import analyze
from app.schemas.analyzer import AnalyzeRequest, AnalyzeResponse, AnalyzeResult

router = APIRouter(tags=["analyzer"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def post_analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    results = await analyze(req.items, req.workspace_id)
    return AnalyzeResponse(results=[AnalyzeResult(**r) for r in results])
