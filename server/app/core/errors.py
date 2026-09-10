"""全局异常处理：一切错误收敛为统一结构 {code, message, detail}。

覆盖四类：
1. AppError 业务异常 → 对应 HTTP 状态码（401 附带 WWW-Authenticate）；
2. RequestValidationError 请求体校验失败 → 422；
3. StarletteHTTPException（404 路由不存在等）→ 原状态码；
4. 其余未捕获异常 → 500 + 完整堆栈日志（不向客户端泄露内部细节）。
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import AppError
from app.schemas.common import ErrorResponse

# 字段中文名与约束提示（校验错误消息用；未知字段回退原文）
_FIELD_LABELS = {"username": "用户名", "password": "密码"}
_FIELD_HINTS = {
    "username": "2–32 位字母/数字/下划线/中文",
    "password": "8–72 位",
}


def _format_validation_error(error: dict) -> str:
    """把 pydantic 校验错误翻译为面向用户的中文提示。"""
    loc = [str(part) for part in error.get("loc", []) if part != "body"]
    field = loc[-1] if loc else ""
    label = _FIELD_LABELS.get(field, field)
    error_type = error.get("type", "")
    ctx = error.get("ctx", {})

    if error_type == "missing":
        return f"缺少必填参数：{label}"
    if error_type == "string_too_short":
        return f"{label}长度不足，至少 {ctx.get('min_length', '?')} 位"
    if error_type == "string_too_long":
        return f"{label}长度超出，最多 {ctx.get('max_length', '?')} 位"
    if error_type == "string_pattern_mismatch":
        hint = _FIELD_HINTS.get(field, "")
        return f"{label}格式不合法（{hint}）" if hint else f"{label}格式不合法"
    if error_type == "json_invalid":
        return "请求体不是合法 JSON"
    return f"{label}不合法：{error.get('msg', '')}"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "业务异常 {} {} -> {} {}",
            request.method,
            request.url.path,
            exc.code,
            exc.message,
        )
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        body = ErrorResponse(code=exc.code, message=exc.message, detail=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        # 取第一条错误翻译为中文提示；完整列表放 detail 便于排查
        message = _format_validation_error(errors[0] if errors else {})
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                code="validation_error",
                message=message,
                detail=f"{errors}",
            ).model_dump(),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code >= 500:  # 这类异常本不该出现，记录堆栈便于排查
            logger.exception("HTTP {} {} {}", exc.status_code, request.method, request.url.path)
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                code="http_error",
                message=str(exc.detail),
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # 显式传入异常对象记录完整堆栈（handler 不在 except 块内，exception() 取不到）
        logger.opt(exception=(type(exc), exc, exc.__traceback__)).error(
            "未处理异常 {} {} -> {}", request.method, request.url.path, type(exc).__name__
        )
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(code="internal_error", message="服务器内部错误").model_dump(),
        )
