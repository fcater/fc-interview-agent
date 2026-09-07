"""健康检查响应模型。"""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """/health 响应：整体状态 + 运行模式 + 数据库连通性。

    - status="ok"：服务与依赖均正常
    - status="degraded"：服务在线，但数据库等依赖不可达
      （HTTP 仍为 200，便于前端区分「后端不可达」与「依赖降级」）
    - status="error"：健康检查自身执行异常（服务可能部分失效），detail 给出原因
    """

    status: Literal["ok", "degraded", "error"]
    app_llm_mode: str
    database: Literal["up", "down"] | None = None  # error 时可能未知
    detail: str | None = None  # status="error" 时的错误原因
