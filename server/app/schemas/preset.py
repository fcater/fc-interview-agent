"""预设标准答案 DTO（M6，E6）。

tags 为用户声明的适用范围（命中判定「任一标签为提问文本子串」），
非系统枚举——标签体系本身可调（E6）。
"""

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class PresetUpsertRequest(BaseModel):
    """创建/更新预设答案（题目 + 参考答案 + 标签）。"""

    question: str = Field(min_length=1, max_length=2000, description="预设问题（向量化匹配用）")
    answer: str = Field(min_length=1, max_length=20_000, description="标准答案全文")
    tags: list[str] = Field(default_factory=list, max_length=8, description="标签（≤8 个）")

    @field_validator("question", "answer")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        # min_length 不拦纯空白串；空白问题/答案入库后无法匹配也无展示价值
        if not v.strip():
            raise ValueError("内容不能为空白")
        return v


class PresetBrief(BaseModel):
    """预设答案简要信息（列表/表单回填）。"""

    model_config = {"from_attributes": True}

    id: int
    question: str
    answer: str
    tags: list[str]
    created_at: dt.datetime
