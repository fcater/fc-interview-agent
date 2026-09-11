"""Prompt 模板管理（tech-stack §4.3）：app/prompts/*.md + jinja2 渲染。

模板在注册时即加载并编译，文件缺失 / 变量缺失在启动期报错，
不会拖到运行期才暴露。
"""

from functools import cache
from pathlib import Path

from jinja2 import Environment, StrictUndefined, TemplateNotFound

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_env = Environment(
    loader=None,  # 显式读文件，保持模板清单集中可见
    undefined=StrictUndefined,  # 变量缺失 → 渲染期报错（启动期预热后即启动期暴露）
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=False,
)


@cache
def load_template(name: str):
    """按文件名加载并编译模板；文件缺失立即抛错（启动期/首次调用暴露）。"""
    path = PROMPTS_DIR / name
    if not path.is_file():
        raise TemplateNotFound(f"Prompt 模板缺失：{path}")
    return _env.from_string(path.read_text(encoding="utf-8"))


def render_prompt(name: str, **variables: str) -> str:
    """渲染模板；未提供的变量因 StrictUndefined 直接抛错。"""
    return load_template(name).render(**variables)
