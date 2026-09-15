"""面试评分报告 DTO 与 LLM 结构化输出 schema（E8）。

InterviewReport 是评分链的结构化输出模型（with_structured_output）：
结构固定（综合分 / 维度列表 / 问题总结 / 改进建议），但**维度名与标准
由 rubric 模板驱动**（tech-stack §5-E5）——替换 app/prompts/report_rubric.md
即换评分维度与标准，程序零改动。
"""

import datetime as dt

from pydantic import BaseModel, Field

# ── LLM 结构化输出（评分链，E8）─────────────────────────────────


class ReportDimension(BaseModel):
    """单个评分维度（名称随 rubric 模板变化，分数 0-100）。"""

    name: str = Field(description="维度名称，与评分标准中的维度一致")
    score: int = Field(ge=0, le=100, description="该维度得分，0-100 整数")
    comment: str = Field(description="该维度一两句中文评语，结合回答中的具体表现")


class InterviewReport(BaseModel):
    """评分报告：综合评分 + 分维度得分 + 主要问题 + 改进建议。

    dimensions 为列表结构：维度个数与名称由 rubric 模板决定（默认 4 维），
    schema 本身固定，保证格式稳定（roadmap M5 验收 ①③）。
    """

    overall_score: int = Field(ge=0, le=100, description="综合评分，0-100 整数")
    dimensions: list[ReportDimension] = Field(
        min_length=1, description="各评分维度得分与评语，维度以评分标准为准"
    )
    main_problems: list[str] = Field(
        description="主要问题总结，最多 3 条，每条一句中文，指向具体回答"
    )
    improvements: list[str] = Field(
        description="改进建议，最多 3 条，每条一句中文，可操作"
    )


# ── 会话 DTO ─────────────────────────────────────────────────────


class ReportResponse(BaseModel):
    """评分报告响应（evaluation_reports 行序列化；report 为全量报告结构）。"""

    model_config = {"from_attributes": True}

    id: int
    session_id: int
    overall_score: int
    report: InterviewReport
    created_at: dt.datetime


class InterviewRecordBrief(BaseModel):
    """历史面试列表项：会话概要 + 简历/JD 标题 + 综合评分。"""

    id: int
    status: str
    role: str
    question_count: int
    created_at: dt.datetime
    resume_title: str | None = None
    jd_title: str | None = None
    overall_score: int | None = None
