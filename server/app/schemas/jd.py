"""JD DTO：录入 / 提取 / 列表 / 详情。

JDKeyPoints 同时是结构化输出 schema（E8，with_structured_output）
与 key_points JSONB 列的存储结构。
"""

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class JDKeyPoints(BaseModel):
    """JD 结构化关键点（LLM 提取结果，E8）。"""

    position: str = Field(default="", description="岗位名称")
    responsibilities: list[str] = Field(default_factory=list, description="核心职责")
    required_skills: list[str] = Field(default_factory=list, description="必备技术栈/技能")
    preferred_skills: list[str] = Field(default_factory=list, description="加分项/优先技能")
    experience_requirements: list[str] = Field(default_factory=list, description="经验与学历要求")
    soft_skills: list[str] = Field(default_factory=list, description="软技能与素质要求")


class JDExtractRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000, description="JD 原文")


class JDExtractResponse(BaseModel):
    key_points: JDKeyPoints


class JDCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    content: str = Field(min_length=1, max_length=100_000)
    key_points: JDKeyPoints | None = Field(
        default=None,
        description="可选：先经 /jds/extract 提取的结果；缺省时服务端自动提取",
    )


class JDBrief(BaseModel):
    """列表项：不含正文（历史 JD 复选用）。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    key_points: dict | None
    created_at: dt.datetime


class JDDetail(JDBrief):
    content: str
