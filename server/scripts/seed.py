"""演示/测试数据种子脚本：统一管理本地开发与验收用的 mock 数据。

用法（在 server/ 下）：
    uv run python scripts/seed.py                # 幂等灌入：已存在的用户/数据跳过
    uv run python scripts/seed.py --with-vectors # 为种子简历做向量化（需本机 Ollama）
    uv run python scripts/seed.py --reset        # 先删再灌（重建种子数据）
    uv run python scripts/seed.py --clean        # 仅删除种子数据（验收后清理库）

默认不向量化：保证无 Ollama/无外网时也能一键准备业务数据；向量数据可随时
通过 --with-vectors 单独补齐（M3 起检索依赖它，M4 联调建议开启）。

简历正文不内联在本文件，改为读同目录 resume_*.md：篇幅按真实简历的体量
（2–3 千字）维护，便于直接比对切片效果；本文件只留画像配置。

四位种子用户分属前端/后端/全栈/AI Agent 画像，简历与 JD 内容互不重叠：
多用户隔离验收靠这一语义判据——按一方的技术栈检索不应命中另一方的切片。
"""

import argparse
import asyncio
import dataclasses
from pathlib import Path

from sqlalchemy import delete, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.knowledge.service import (
    delete_preset_vectors,
    delete_resume_vectors,
    ingest_preset_answer,
    ingest_resume,
)
from app.models import JD, PresetAnswer, Resume, User
from app.schemas.jd import JDKeyPoints

SEED_PASSWORD = "seed12345"

_SCRIPT_DIR = Path(__file__).resolve().parent


def _load_resume(filename: str) -> str:
    """读同目录下的简历正文：内容与代码解耦，换简历不必改 seed.py。"""
    return (_SCRIPT_DIR / filename).read_text(encoding="utf-8")


@dataclasses.dataclass
class SeedPersona:
    """一位种子用户的完整画像：用户名 + 该用户专属的简历、JD 与预设答案。"""

    username: str
    resume_title: str
    resume_md: str
    jd_title: str
    jd_content: str
    jd_key_points: JDKeyPoints
    # M6 预设标准答案：(question, answer, tags)，按 question 判重
    presets: list[tuple[str, str, list[str]]]


_CHENXIAO_JD_KP = JDKeyPoints(
    position="高级前端工程师（React）",
    responsibilities=[
        "负责核心业务前端应用的架构设计与性能优化",
        "建设与维护组件库、设计系统等前端基础设施",
        "推动前端工程化与质量保障体系落地",
    ],
    required_skills=["React", "TypeScript", "前端工程化"],
    preferred_skills=["数据可视化", "构建工具优化", "Monorepo"],
    experience_requirements=["本科及以上学历", "5 年以上前端开发经验"],
    soft_skills=["技术方案输出能力", "跨团队沟通能力"],
)

_ZHOUHANG_JD_KP = JDKeyPoints(
    position="高级后端工程师（Go）",
    responsibilities=[
        "负责交易、订单核心链路的架构设计与稳定性保障",
        "主导高并发场景下的性能优化与容量规划",
        "推动服务治理与可观测性体系建设",
    ],
    required_skills=["Go", "MySQL", "Redis", "Kafka"],
    preferred_skills=["分库分表", "分布式事务", "Kubernetes", "Flink"],
    experience_requirements=["本科及以上学历", "5 年以上后端开发经验"],
    soft_skills=["线上问题定位能力", "技术方案输出能力"],
)

_LINYUE_JD_KP = JDKeyPoints(
    position="全栈开发工程师（TypeScript/Node）",
    responsibilities=[
        "负责 SaaS 产品前后端全链路研发与交付",
        "参与多租户架构、权限体系与计费模块设计",
        "推动 CI/CD 与研发交付效率提升",
    ],
    required_skills=["TypeScript", "Node.js", "React", "PostgreSQL"],
    preferred_skills=["多租户架构", "NestJS", "支付对接", "CI/CD"],
    experience_requirements=["本科及以上学历", "4 年以上全栈或后端开发经验"],
    soft_skills=["独立交付能力", "跨职能协作能力"],
)

_ZHENGCHUAN_JD_KP = JDKeyPoints(
    position="AI Agent 开发工程师（Python）",
    responsibilities=[
        "负责 LLM 应用与 Agent 链路的方案设计与工程落地",
        "主导 RAG 检索链路、切片策略与检索效果优化",
        "建设 AI 应用评测体系与效果监控",
    ],
    required_skills=["Python", "RAG 检索", "Prompt Engineering"],
    preferred_skills=["LangGraph", "Function Calling", "MCP", "向量数据库"],
    experience_requirements=["本科及以上学历", "3 年以上 AI 应用或后端开发经验"],
    soft_skills=["业务抽象能力", "数据驱动迭代意识"],
)

SEED_PERSONAS = [
    SeedPersona(
        username="chenxiao",
        resume_title="陈晓",
        resume_md=_load_resume("resume_frontend.md"),
        jd_title="高级前端工程师（React）",
        jd_content="""# 高级前端工程师（React）

## 岗位职责
1. 负责核心业务前端应用的架构设计与性能优化；
2. 建设与维护组件库、设计系统等前端基础设施；
3. 推动前端工程化与质量保障体系落地。

## 任职要求
- 本科及以上学历，5 年以上前端开发经验；
- 精通 React 与 TypeScript，具备中大型项目架构设计经验；
- 有数据可视化或构建工具优化实践经验者优先；
- 熟悉 Monorepo 工程实践者优先；
- 具备良好的技术方案输出能力与跨团队沟通能力。
""",
        jd_key_points=_CHENXIAO_JD_KP,
        presets=[
            (
                "介绍一下你做过的最有挑战的项目",
                "最有挑战的是 BI 可视化平台的大数据量渲染：单看板 50+ 图表、20 万数据点，"
                "最初交互帧率只有 18fps。我改用 Canvas 渲染 + Web Worker 离屏计算 + 增量更新，"
                "把帧率提到 55fps，卡顿投诉基本清零。",
                ["项目", "挑战", "可视化"],
            ),
            (
                "你们前端的首屏性能是怎么优化的",
                "在 BI 平台架构升级里我做了三件事：构建产物瘦身、路由级代码分割、关键资源预加载，"
                "并把 LCP、INP 纳入上线卡点形成闭环。最终产物体积下降 46%，"
                "首屏 LCP 从 3.8s 优化到 1.5s。",
                ["性能", "首屏", "优化"],
            ),
        ],
    ),
    SeedPersona(
        username="zhouhang",
        resume_title="周航",
        resume_md=_load_resume("resume_backend.md"),
        jd_title="高级后端工程师（Go）",
        jd_content="""# 高级后端工程师（Go）

## 岗位职责
1. 负责交易、订单核心链路的架构设计与稳定性保障；
2. 主导高并发场景下的性能优化与容量规划；
3. 推动服务治理与可观测性体系建设。

## 任职要求
- 本科及以上学历，5 年以上后端开发经验；
- 精通 Go，熟悉 MySQL、Redis、Kafka 等常用组件；
- 有分库分表、分布式事务实践经验者优先；
- 有 Kubernetes 或 Flink 实时计算经验者优先；
- 具备良好的线上问题定位能力与技术方案输出能力。
""",
        jd_key_points=_ZHOUHANG_JD_KP,
        presets=[
            (
                "介绍一下你做过的最有技术挑战的项目",
                "最有挑战的是订单库分库分表改造：1.2 亿数据要在线迁移且业务无感知。"
                "我设计了以用户 ID 为分片键、订单号内置分片因子的方案，"
                "用双写 + 数据校验 + 灰度切读分阶段推进。最终业务零中断、零数据丢失，"
                "慢查询率下降 92%。",
                ["项目", "挑战", "分库分表"],
            ),
            (
                "大促高并发场景你是怎么保障稳定性的",
                "我按三级联动做预案：网关层限流、服务层熔断、非核心链路降级，"
                "配套全链路压测和容量评估。订单中台大促峰值支撑 5 万 QPS，"
                "核心链路 P99 稳定在 120ms 以内，连续两年大促零故障。",
                ["高并发", "稳定性", "限流"],
            ),
        ],
    ),
    SeedPersona(
        username="linyue",
        resume_title="林悦",
        resume_md=_load_resume("resume_fullstack.md"),
        jd_title="全栈开发工程师（TypeScript/Node）",
        jd_content="""# 全栈开发工程师（TypeScript/Node）

## 岗位职责
1. 负责 SaaS 产品前后端全链路研发与交付；
2. 参与多租户架构、权限体系与计费模块设计；
3. 推动 CI/CD 与研发交付效率提升。

## 任职要求
- 本科及以上学历，4 年以上全栈或后端开发经验；
- 熟悉 TypeScript、Node.js 与 React，能独立完成前后端开发；
- 熟悉 PostgreSQL，具备数据建模与慢查询治理能力；
- 有多租户 SaaS 或支付对接经验者优先；
- 具备独立交付能力与良好的跨职能协作能力。
""",
        jd_key_points=_LINYUE_JD_KP,
        presets=[
            (
                "介绍一下你负责过的完整项目",
                "我主导过多租户 SaaS 运营平台从 0 到 1 的交付，覆盖租户开通、权限、"
                "计费订阅和数据看板。数据模型上用共享库 + 租户 ID 隔离，"
                "并用 NestJS 中间件统一处理租户解析与权限校验。"
                "目前支撑 2000+ 企业租户、日活 1.2 万，核心接口 P95 在 240ms 以内。",
                ["项目", "全栈", "SaaS"],
            ),
            (
                "多租户系统的数据隔离你是怎么设计的",
                "我采用共享库 + 租户 ID 的方案，在 NestJS 里做租户上下文中间件，"
                "把租户解析、RBAC 权限校验和数据范围过滤统一收敛到请求链路，"
                "避免每个业务查询各自拼过滤条件。权限上分角色、权限点、数据范围三层控制。",
                ["多租户", "权限", "架构"],
            ),
        ],
    ),
    SeedPersona(
        username="zhengchuan",
        resume_title="郑川",
        resume_md=_load_resume("resume_agent.md"),
        jd_title="AI Agent 开发工程师（Python）",
        jd_content="""# AI Agent 开发工程师（Python）

## 岗位职责
1. 负责 LLM 应用与 Agent 链路的方案设计与工程落地；
2. 主导 RAG 检索链路、切片策略与检索效果优化；
3. 建设 AI 应用评测体系与效果监控。

## 任职要求
- 本科及以上学历，3 年以上 AI 应用或后端开发经验；
- 熟悉 Python，具备 RAG 检索链路的完整落地经验；
- 熟悉 Prompt Engineering，理解上下文工程与幻觉治理；
- 有 LangGraph、Function Calling、MCP 实践经验者优先；
- 熟悉向量数据库（pgvector / Milvus 等）者优先；
- 具备良好的业务抽象能力与数据驱动迭代意识。
""",
        jd_key_points=_ZHENGCHUAN_JD_KP,
        presets=[
            (
                "介绍一下你在 RAG 检索上的优化经验",
                "我在企业知识库问答里做过系统性调优：按文档结构分级切片并保留标题层级，"
                "检索上用向量 + BM25 混合召回再做 Rerank 精排。"
                "另外建了 500+ 真实问题的评测集，让优化从主观感受变成数据驱动，"
                "问答准确率从 61% 提升到 88%。",
                ["RAG", "检索", "优化"],
            ),
            (
                "你是怎么把业务能力封装成 Agent 工具的",
                "在智能客服 Agent 里，我用 Function Calling 实现了订单查询、物流跟踪、"
                "退款申请、工单创建四类工具，并按 MCP 协议统一工具描述和参数 Schema，"
                "让多个 AI 应用复用。工具调用成功率从 82% 提升到 96%。",
                ["Agent", "工具调用", "MCP"],
            ),
        ],
    ),
]

SEED_USERNAMES = [p.username for p in SEED_PERSONAS]


async def seed_user(session, persona: SeedPersona, *, with_vectors: bool) -> list[str]:
    """为单个画像幂等灌入简历与 JD，返回动作说明。"""
    actions: list[str] = []
    user = (
        await session.scalars(select(User).where(User.username == persona.username))
    ).first()
    if user is None:
        user = User(username=persona.username, password_hash=hash_password(SEED_PASSWORD))
        session.add(user)
        await session.flush()
        actions.append(f"创建用户 {persona.username}")
    else:
        actions.append(f"用户 {persona.username} 已存在（password={SEED_PASSWORD}）")

    # 简历按标题判重，JD 按 title 判重；已有数据不动（--reset 时会先清空）
    resume = (
        await session.scalars(
            select(Resume).where(Resume.user_id == user.id, Resume.title == persona.resume_title)
        )
    ).first()
    if resume is None:
        resume = Resume(user_id=user.id, title=persona.resume_title, content=persona.resume_md)
        session.add(resume)
        await session.flush()
        actions.append(f"  简历「{persona.resume_title}」id={resume.id}")
    # 向量化独立于建行判断：已存在但未向量化的简历（如先跑过默认模式）也能补齐
    if with_vectors and not resume.vector_ids:
        resume.vector_ids = await ingest_resume(resume)
        actions.append(f"  简历「{persona.resume_title}」已向量化 {len(resume.vector_ids)} 片")

    jd = (
        await session.scalars(
            select(JD).where(JD.user_id == user.id, JD.title == persona.jd_title)
        )
    ).first()
    if jd is None:
        jd = JD(
            user_id=user.id,
            title=persona.jd_title,
            content=persona.jd_content,
            key_points=persona.jd_key_points.model_dump(),
        )
        session.add(jd)
        await session.flush()
        actions.append(f"  JD「{persona.jd_title}」id={jd.id}")

    # M6 预设标准答案：按 question 判重，向量化与简历同规则（--with-vectors 补齐）
    for question, answer, tags in persona.presets:
        preset = (
            await session.scalars(
                select(PresetAnswer).where(
                    PresetAnswer.user_id == user.id, PresetAnswer.question == question
                )
            )
        ).first()
        if preset is None:
            preset = PresetAnswer(user_id=user.id, question=question, answer=answer, tags=tags)
            session.add(preset)
            await session.flush()
            actions.append(f"  预设答案「{question[:12]}…」id={preset.id}")
        if with_vectors and not preset.vector_ids:
            preset.vector_ids = await ingest_preset_answer(preset)
            actions.append(f"  预设答案「{question[:12]}…」已向量化")

    await session.commit()
    return actions


async def clean_users(session) -> int:
    """删除全部种子用户及其业务数据与向量切片，返回删除的用户数。

    M4 起面试会话等新表如与种子用户关联，需在此追加清理。
    """
    users = (
        await session.scalars(select(User).where(User.username.in_(SEED_USERNAMES)))
    ).all()
    if not users:
        return 0
    user_ids = [user.id for user in users]
    # 先收集 vector_ids 再删业务行，避免向量切片失去关联后成为孤儿
    stale_vector_ids: list[str] = []
    for row in await session.scalars(
        select(Resume.vector_ids).where(Resume.user_id.in_(user_ids))
    ):
        stale_vector_ids.extend(row or [])
    for row in await session.scalars(
        select(PresetAnswer.vector_ids).where(PresetAnswer.user_id.in_(user_ids))
    ):
        stale_vector_ids.extend(row or [])
    await session.execute(delete(Resume).where(Resume.user_id.in_(user_ids)))
    await session.execute(delete(JD).where(JD.user_id.in_(user_ids)))
    await session.execute(delete(PresetAnswer).where(PresetAnswer.user_id.in_(user_ids)))
    await session.execute(delete(User).where(User.id.in_(user_ids)))
    await session.commit()
    if stale_vector_ids:
        await delete_resume_vectors(stale_vector_ids)
        await delete_preset_vectors(stale_vector_ids)
    return len(users)


async def main() -> None:
    parser = argparse.ArgumentParser(description="灌入演示/测试数据（默认幂等）")
    parser.add_argument(
        "--reset", action="store_true", help="先删除种子用户及其业务数据再重建"
    )
    parser.add_argument(
        "--clean", action="store_true", help="仅删除种子用户及其业务数据（验收后清理库）"
    )
    parser.add_argument(
        "--with-vectors",
        action="store_true",
        help="为种子简历做向量化（需本机 Ollama 的 bge-m3）",
    )
    args = parser.parse_args()

    async with SessionLocal() as session:
        if args.clean:
            removed = await clean_users(session)
            print(f"已清理 {removed} 位种子用户及其数据" if removed else "无种子数据可清理")
            return
        if args.reset:
            removed = await clean_users(session)
            print(f"已清理旧种子数据（{removed} 位用户）")
        for persona in SEED_PERSONAS:
            for line in await seed_user(session, persona, with_vectors=args.with_vectors):
                print(line)
    print("种子数据就绪")


if __name__ == "__main__":
    asyncio.run(main())
