"""中文文本切片（R6）：RecursiveCharacterTextSplitter 定制中文分隔符 + 段落重叠。

切片参数（chunk_size / chunk_overlap）集中在 config（E6），
按实际检索效果迭代调整，不改代码。
"""

from functools import cache

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings

# 优先按段落/换行切，再退到中文句读，最后按字符硬切
_SEPARATORS = ["\n\n", "\n", "。", "！", "？", "；", "，", "、", " ", ""]


@cache
def build_text_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
        separators=_SEPARATORS,
        keep_separator=True,
    )
