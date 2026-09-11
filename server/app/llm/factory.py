"""对话模型工厂（E2）：init_chat_model 配置化接入，业务层不出现模型名。

provider 留空时按 APP_LLM_MODE 推导（local→ollama，online→openai 兼容协议），
也可用 APP_CHAT_PROVIDER 显式覆盖（如 local 模式接局域网 vLLM）。
"""

from functools import cache

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

from app.config import settings


@cache
def get_chat_model() -> BaseChatModel:
    """构造对话模型（进程内单例；切换供应商改配置即可，代码不变）。"""
    provider = settings.chat_provider or (
        "ollama" if settings.app_llm_mode == "local" else "openai"
    )
    if provider == "ollama":
        model = init_chat_model(
            f"ollama:{settings.chat_model}",
            base_url=settings.ollama_base_url,
            temperature=settings.chat_temperature,
            timeout=settings.chat_timeout_seconds,
        )
    else:
        # openai 及其他 OpenAI 兼容端点（DeepSeek / Qwen / SiliconFlow / vLLM 等）
        model = init_chat_model(
            f"openai:{settings.chat_model}",
            base_url=settings.chat_base_url or None,
            api_key=settings.chat_api_key or None,
            temperature=settings.chat_temperature,
            timeout=settings.chat_timeout_seconds,
            max_retries=settings.chat_max_retries,
        )
    return model
