"""loguru 日志接入（tech-stack §2.10：结构化日志）。

应用启动时调用 setup_logging()；业务代码直接 `from loguru import logger`。
"""

import sys

from loguru import logger

_LOG_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
    "<level>{level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan> - "
    "<level>{message}</level>"
)


def setup_logging() -> None:
    """移除默认 handler，统一输出到 stderr（uvicorn 窗口可见）。"""
    logger.remove()
    logger.add(sys.stderr, format=_LOG_FORMAT, level="INFO")
