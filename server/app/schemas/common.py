"""通用响应结构：统一错误体。"""

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    """所有错误响应的统一结构（code 稳定机器码 + 中文 message）。"""

    code: str
    message: str
    detail: str | None = None
