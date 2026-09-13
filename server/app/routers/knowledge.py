"""知识库路由：语义检索调试端点（用户隔离；供验收与前端/面试官调试）。

业务链路（简历上传/删除的向量同步）在 resumes 路由内完成，
检索核心在 knowledge.service，M4 面试官图直接复用服务层。
"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.knowledge.service import search
from app.models import User
from app.schemas.knowledge import KnowledgeSearchRequest, KnowledgeSearchResponse

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    user: User = Depends(get_current_user),
) -> KnowledgeSearchResponse:
    """在当前用户的简历知识库中做语义检索（topK 与阈值走配置）。"""
    chunks = await search(payload.query, user_id=user.id)
    return KnowledgeSearchResponse.of(chunks)
