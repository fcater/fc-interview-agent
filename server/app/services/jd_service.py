"""JD 服务：关键点提取（with_structured_output，E8）+ 模板渲染。"""

from loguru import logger

from app.config import settings
from app.llm.factory import get_chat_model
from app.llm.prompts import render_prompt
from app.schemas.jd import JDKeyPoints

_TEMPLATE = "jd_extract.md"


async def extract_key_points(content: str) -> JDKeyPoints:
    """调用对话模型提取 JD 结构化关键点。

    提取为确定性任务，绑定提取专用低温（chat_extract_temperature）
    减少字段遗漏/漂移（R4）；失败重试由模型层配置（chat_max_retries）承担。
    """
    model = get_chat_model().bind(temperature=settings.chat_extract_temperature)
    prompt = render_prompt(_TEMPLATE, content=content)
    structured = model.with_structured_output(JDKeyPoints)
    result = await structured.ainvoke(prompt)
    logger.info(
        "JD 关键点提取完成 model={} position={}",
        type(model).__name__,
        result.position,
    )
    return result
