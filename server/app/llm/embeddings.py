"""Embedding 工厂（E3）：init_embeddings 配置化接入，业务层不出现模型名。

与对话模型工厂同构：provider 留空按 APP_LLM_MODE 推导
（local→ollama，online→openai 兼容端点），显式设置可覆盖。
维度必须与 settings.embedding_dimensions / PGVector 建表对齐。
"""

from functools import cache

from langchain.embeddings import init_embeddings
from langchain_core.embeddings import Embeddings

from app.config import settings


@cache
def get_embeddings() -> Embeddings:
    """构造 Embedding 模型（进程内单例）。"""
    provider = settings.embedding_provider or (
        "ollama" if settings.llm_mode == "local" else "openai"
    )
    if provider == "ollama":
        return init_embeddings(
            f"ollama:{settings.embedding_model}",
            base_url=settings.ollama_base_url,
        )
    # openai 兼容端点（如 SiliconFlow 的 BAAI/bge-m3）
    return init_embeddings(
        f"openai:{settings.embedding_model}",
        base_url=settings.embedding_base_url or None,
        api_key=settings.embedding_api_key or None,
    )
