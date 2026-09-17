"""JD 服务：关键点提取（with_structured_output，E8）+ 模板渲染。"""

from loguru import logger

from app.config import settings
from app.core.exceptions import JDExtractError
from app.llm.factory import get_extract_model
from app.llm.prompts import render_prompt
from app.schemas.jd import JDKeyPoints

_TEMPLATE = "jd_extract.md"


async def extract_key_points(content: str) -> JDKeyPoints:
    """调用对话模型提取 JD 结构化关键点。

    提取为确定性任务，走提取专用模型（低温 + 关闭思维链，见 settings.chat_extract_*）：
    思维链 token 计入 num_predict，长 JD 下会把 JSON 输出挤空导致解析必然失败（实测）。
    解析失败包成 AppError（统一错误结构），不以未处理异常 500 抛出。
    """
    prompt = render_prompt(_TEMPLATE, content=content)
    structured = get_extract_model().with_structured_output(JDKeyPoints)
    try:
        result = await structured.ainvoke(prompt)
    except Exception as exc:
        logger.warning("JD 关键点提取失败 model={} err={}", settings.chat_model, exc)
        raise JDExtractError(
            "JD 关键点提取失败，请重试或换一段更简洁的 JD 原文",
            detail=f"{type(exc).__name__}: {exc}",
        ) from exc
    logger.info(
        "JD 关键点提取完成 model={} position={} skills={}",
        settings.chat_model,
        result.position,
        len(result.required_skills),
    )
    return result
