"""对话模型工厂（E2）：init_chat_model 配置化接入，业务层不出现模型名。

provider 留空时按 APP_LLM_MODE 推导（local→ollama，online→openai 兼容协议），
也可用 APP_CHAT_PROVIDER 显式覆盖（如 local 模式接局域网 vLLM）。

注意：temperature 等推理参数只能在构造期传入——ChatOllama 的 invoke 期 kwargs
仅 format/reasoning/options 等少数键会收进请求体，temperature 之类原样透传给底层
ollama 客户端直接 TypeError；而 bind() 写在 with_structured_output() 之前时整个
绑定会被静默丢弃（langchain-ollama 1.1.0 实测踩坑，别再用 .bind(temperature=...)）。
"""

from functools import cache

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

from app.config import settings


def _build_chat_model(
    *, temperature: float, ollama_reasoning: bool | None = None
) -> BaseChatModel:
    """按供应商构造对话模型（供应商/模型名/推理参数全部来自配置，代码不变）。"""
    provider = settings.chat_provider or (
        "ollama" if settings.llm_mode == "local" else "openai"
    )
    if provider == "ollama":
        return init_chat_model(
            f"ollama:{settings.chat_model}",
            base_url=settings.ollama_base_url,
            temperature=temperature,
            # ChatOllama 无 timeout 字段（langchain extra=allow 会静默吞掉），
            # 超时须经 client_kwargs 传入底层 ollama/httpx 客户端，否则
            # Ollama 侧排队/断连时请求无限挂起（后台报告任务实测踩坑）
            client_kwargs={"timeout": settings.chat_timeout_seconds},
            # 上下文窗口与生成上限：防长 prompt 触发 context shift 死循环
            num_ctx=settings.chat_num_ctx,
            num_predict=settings.chat_num_predict,
            # 思维链开关（think）：None = 模型默认（思维链模型默认开）
            reasoning=ollama_reasoning,
        )
    # openai 及其他 OpenAI 兼容端点（DeepSeek / Qwen / SiliconFlow / vLLM 等）：
    # ollama_reasoning 在此分支不适用，在线端点的思维链由供应商侧控制
    return init_chat_model(
        f"openai:{settings.chat_model}",
        base_url=settings.chat_base_url or None,
        api_key=settings.chat_api_key or None,
        temperature=temperature,
        timeout=settings.chat_timeout_seconds,
        max_retries=settings.chat_max_retries,
    )


@cache
def get_chat_model() -> BaseChatModel:
    """通用对话模型（面试官/求职者流式对话；进程内单例）。"""
    return _build_chat_model(temperature=settings.chat_temperature)


@cache
def get_extract_model() -> BaseChatModel:
    """提取/评分等结构化任务模型（E8）：低温 + 关闭思维链（进程内单例）。

    结构化任务是确定性任务，思维链只会挤占 num_predict 预算：本地 qwen3 在长
    prompt 下思维链跑满上限、content 全空，with_structured_output 必然解析失败。
    """
    return _build_chat_model(
        temperature=settings.chat_extract_temperature,
        ollama_reasoning=settings.chat_extract_reasoning,
    )
