"""评分链（M5）：面试结束后基于问答记录生成结构化评分报告。

独立于面试官图（保持图的 QA 闭环单一职责）：报告属终局后处理，
输入为 interview_qa 拼装的 transcript + 简历/JD 上下文，输出走
with_structured_output(InterviewReport)（E8）。评分维度与标准由
rubric 模板驱动（E5）——替换 report_rubric.md 即换评分标准。
"""

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from app.config import settings
from app.core.exceptions import ReportGenerationError
from app.llm.factory import get_chat_model
from app.llm.prompts import render_prompt
from app.schemas.report import InterviewReport

# 系统提示为静态文本：rubric 全文（含简历/JD/问答占位）经 render_prompt 渲染后
# 作为用户消息传入，系统侧只固定角色与输出纪律（load_template 返回 jinja2
# Template 而非字符串，不能直接当消息内容）
_SYSTEM_PROMPT = (
    "你是资深中文技术面试评估官。严格按用户消息给出的评分维度与标准执行评估，"
    "只输出结构化中文评分报告。"
)


async def generate_report(
    *, resume_context: str, jd_key_points: str, qa_transcript: str
) -> InterviewReport:
    """生成评分报告：低温结构化输出 + 应用层重试（本地小模型成功率约 95%）。"""
    prompt = render_prompt(
        "report_rubric.md",
        resume_context=resume_context,
        jd_key_points=jd_key_points,
        qa_transcript=qa_transcript,
    )
    structured = (
        get_chat_model()
        .bind(temperature=settings.chat_extract_temperature)
        .with_structured_output(InterviewReport)
    )
    last_error: Exception | None = None
    for attempt in range(settings.report_max_retries + 1):
        try:
            result = await structured.ainvoke(
                [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=prompt)]
            )
            logger.info(
                "评分报告生成成功 overall={} dimensions={}",
                result.overall_score,
                [d.name for d in result.dimensions],
            )
            return result
        except Exception as exc:  # 本地模型 JSON 解析失败等：重试由应用层承担
            last_error = exc
            logger.warning("评分报告生成失败（第 {} 次尝试）：{}", attempt + 1, exc)
    raise ReportGenerationError(
        "评分报告生成失败，请稍后重试",
        detail=f"重试 {settings.report_max_retries} 次后仍失败：{last_error}",
    )
