"""全局配置中心（pydantic-settings）。

全部可调参数集中于此，由环境变量（或 server/.env）注入，业务代码不出现
硬编码的供应商、模型名与阈值（tech-stack §4.2）。
环境变量统一使用 `APP_` 前缀，样例见 server/.env.example。
"""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """聚合全部可调参数：模型 / embedding / 数据库 / JWT / 面试与 RAG 行为。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
    )

    # ── 运行模式 ──────────────────────────────────────────────────
    # local：本地开发，接入本机 Ollama 小模型（无 key 无外网）
    # online：生产环境，接入在线模型（OpenAI 兼容端点，需要 API key）
    app_llm_mode: Literal["local", "online"] = "local"

    # ── 数据库（业务表 + 向量表同库同实例） ───────────────────────
    # 必填：凭据走环境变量，无默认值（缺失时启动即报错，见 server/.env.example）
    database_url: str

    # ── 认证（JWT） ───────────────────────────────────────────────
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # ── 对话模型（E2：init_chat_model 配置化接入） ───────────────
    # local：provider=ollama，模型跑在本机（地址见 ollama_base_url）
    # online：provider=openai 兼容协议，走 chat_base_url + chat_api_key
    chat_provider: str = "ollama"
    chat_model: str = "qwen3:8b"
    ollama_base_url: str = "http://localhost:11434"
    chat_base_url: str = ""
    chat_api_key: str = ""
    chat_temperature: float = 0.7
    chat_timeout_seconds: int = 60
    chat_max_retries: int = 1

    # ── Embedding（E3：切换模型必须保证维度一致） ─────────────────
    # local：provider=ollama，bge-m3（1024 维）
    # online：provider=openai 兼容端点（如 SiliconFlow 的 BAAI/bge-m3）
    embedding_provider: str = "ollama"
    embedding_model: str = "bge-m3"
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_dimensions: int = 1024  # BGE-M3

    # ── 面试行为（E4：题数上限、追问轮数等可配置） ────────────────
    interview_max_questions: int = 8
    interview_max_follow_ups: int = 2
    interview_memory_window: int = 20  # 对话历史窗口（消息条数）

    # ── 知识库检索（E6：topK、相似度阈值、切片参数可配置） ────────
    rag_top_k: int = 4
    rag_similarity_threshold: float = 0.35
    rag_chunk_size: int = 500
    rag_chunk_overlap: int = 50

    # ── LangGraph 会话检查点（SqliteSaver，thread_id = 面试会话 id） ──
    checkpoint_db_path: str = "data/checkpoints.sqlite"

    # ── CORS ─────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
