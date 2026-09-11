"""简历解析器（E1）：Protocol + 注册表，MVP 实现 Markdown 解析。

新增 PDF / Word 等格式时：实现 ResumeParser 接口并注册到 PARSERS，
路由层按 format 字段查表，其余流程（脱敏、入库、切片）不变。
"""

import re
from typing import Protocol

from pydantic import BaseModel, Field


class ParsedResume(BaseModel):
    """解析结果：统一的结构化产出，与来源格式无关。"""

    title: str = Field(description="简历标题（取首个 H1，缺失时回退传入标题）")
    content: str = Field(description="规范化后的 Markdown 正文")


class ResumeParser(Protocol):
    """简历解析器接口：raw → 结构化结果。"""

    def parse(self, raw: str, *, fallback_title: str) -> ParsedResume: ...


class MarkdownParser:
    """Markdown 解析：提取首个 H1 作为标题，规范化空白。

    MVP 不做深度结构化（项目/教育等分段交给 M3 切片与 LLM 环节），
    仅保证标题可用、正文干净。
    """

    _h1_re = re.compile(r"^\s*#\s+(.+?)\s*$", re.MULTILINE)

    def parse(self, raw: str, *, fallback_title: str) -> ParsedResume:
        title: str | None = None
        m = self._h1_re.search(raw)
        if m:
            title = m.group(1).strip()
        content = raw.strip()
        if m:
            # 正文去掉首个 H1 行，避免标题重复存储/渲染
            content = (raw[: m.start()] + raw[m.end() :]).strip()
        return ParsedResume(title=title or fallback_title, content=content)


# ── 注册表（E1）────────────────────────────────────────────────────
PARSERS: dict[str, ResumeParser] = {
    "markdown": MarkdownParser(),
}


def get_parser(fmt: str) -> ResumeParser:
    """按格式取解析器；未注册的格式明确报错（新格式 = 新实现类 + 注册）。"""
    try:
        return PARSERS[fmt]
    except KeyError as exc:
        raise ValueError(f"不支持的简历格式：{fmt}（可用：{'/'.join(PARSERS)}）") from exc
