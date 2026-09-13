"""知识库检索 DTO（M3 调试/演示端点；M4 起面试官图复用 knowledge.service）。"""

from pydantic import BaseModel, Field

from app.knowledge.service import RetrievedChunk


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000, description="检索问题")


class KnowledgeSearchItem(BaseModel):
    content: str
    score: float = Field(description="cosine 距离，越小越相关")
    resume_id: int
    title: str


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeSearchItem]

    @classmethod
    def of(cls, chunks: list[RetrievedChunk]) -> "KnowledgeSearchResponse":
        return cls(
            results=[
                KnowledgeSearchItem(
                    content=c.content,
                    score=round(c.score, 4),
                    resume_id=c.resume_id,
                    title=c.title,
                )
                for c in chunks
            ]
        )
