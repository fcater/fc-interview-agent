"""敏感信息脱敏（E10）：手机号 / 邮箱正则替换，位于「解析后、切片前」。

独立纯函数，供简历入库流程与后续向量切片（M3）共用。
"""

import re

# 中国大陆手机号：1 开头 11 位；前后不是数字，避免误伤订单号等长数字
_PHONE_RE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")

# 常规邮箱（不做完整 RFC 校验，覆盖常见形态即可）
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def mask_phone(text: str) -> str:
    """手机号脱敏：保留前 3 后 4，如 138****1234。"""
    return _PHONE_RE.sub(lambda m: f"{m.group()[:3]}****{m.group()[-4:]}", text)


def mask_email(text: str) -> str:
    """邮箱脱敏：保留首字符与域名，如 z***@example.com。"""
    return _EMAIL_RE.sub(_mask_email_one, text)


def _mask_email_one(m: re.Match[str]) -> str:
    local, _, domain = m.group().partition("@")
    keep = local[0] if local else "*"
    return f"{keep}***@{domain}"


def sanitize_text(text: str) -> str:
    """对文本执行全部脱敏规则（当前：手机号 + 邮箱）。"""
    return mask_email(mask_phone(text))
