"""简历 DTO：上传 / 列表 / 详情。"""

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ResumeCreateRequest(BaseModel):
    title: str = Field(default="", max_length=128, description="可选标题；缺省取正文首个 H1")
    content: str = Field(min_length=1, max_length=100_000, description="Markdown 简历原文")
    # E1 注册表键；新格式（pdf/word 等）实现解析器后在白名单中扩展
    format: Literal["markdown"] = Field(default="markdown", description="简历格式")


class ResumeBrief(BaseModel):
    """列表项：不含正文。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: dt.datetime
    updated_at: dt.datetime


class ResumeDetail(ResumeBrief):
    content: str
