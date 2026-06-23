from pydantic import BaseModel, Field


class AdvisorRequest(BaseModel):
    question: str = Field(min_length=1)
    workspace_id: str = Field(min_length=1)


class AdvisorResponse(BaseModel):
    answer: str
    sources: list[str]
