from pydantic import BaseModel, Field


class AnalyzeItem(BaseModel):
    description: str = Field(min_length=1)
    amount: float | None = None


class AnalyzeRequest(BaseModel):
    items: list[AnalyzeItem] = Field(min_length=1)
    workspace_id: str = Field(min_length=1)


class AnalyzeResult(BaseModel):
    description: str
    category: str
    merchant: str | None = None
    intent: str
    sentiment: str


class AnalyzeResponse(BaseModel):
    results: list[AnalyzeResult]
