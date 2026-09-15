"""业务异常体系：统一错误结构（code / message / detail），由全局处理器转响应。

code 为稳定机器码（前端可据此分支），message 为面向用户的中文描述。
"""


class AppError(Exception):
    """业务异常基类。"""

    code: str = "internal_error"
    status_code: int = 500

    def __init__(self, message: str, *, detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


class UnauthorizedError(AppError):
    """未认证 / Token 无效 / 过期。"""

    code = "unauthorized"
    status_code = 401


class InvalidCredentialsError(UnauthorizedError):
    """登录失败（用户名不存在或口令错误）。"""

    code = "invalid_credentials"


class ConflictError(AppError):
    """资源冲突（如用户名已被注册）。"""

    code = "conflict"
    status_code = 409


class NotFoundError(AppError):
    """资源不存在。"""

    code = "not_found"
    status_code = 404


class ReportGenerationError(AppError):
    """评分报告生成失败（本地模型结构化输出重试后仍失败）。"""

    code = "report_generation_failed"
    status_code = 500
