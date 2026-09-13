"""演示/测试数据种子脚本：统一管理本地开发与验收用的 mock 数据。

用法（在 server/ 下）：
    uv run python scripts/seed.py                # 幂等灌入：已存在的用户/数据跳过
    uv run python scripts/seed.py --with-vectors # 为种子简历做向量化（需本机 Ollama）
    uv run python scripts/seed.py --reset        # 先删再灌（重建种子数据）
    uv run python scripts/seed.py --clean        # 仅删除种子数据（验收后清理库）

默认不向量化：保证无 Ollama/无外网时也能一键准备业务数据；向量数据可随时
通过 --with-vectors 单独补齐（M3 起检索依赖它，M4 联调建议开启）。

两位种子用户分属后端/前端画像（liming / wangfang），简历与 JD 内容互不重叠：
多用户隔离验收靠这一语义判据——按一方的技术栈检索不应命中另一方的切片。
"""

import argparse
import asyncio
import dataclasses

from sqlalchemy import delete, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.knowledge.service import delete_resume_vectors, ingest_resume
from app.models import JD, Resume, User
from app.schemas.jd import JDKeyPoints

SEED_PASSWORD = "seed12345"


@dataclasses.dataclass
class SeedPersona:
    """一位种子用户的完整画像：用户名 + 该用户专属的简历与 JD。"""

    username: str
    resume_title: str
    resume_md: str
    jd_title: str
    jd_content: str
    jd_key_points: JDKeyPoints


_LIMING_JD_KP = JDKeyPoints(
    position="高级后端工程师（Go/Python）",
    responsibilities=[
        "负责核心业务微服务的设计、开发与稳定性保障",
        "参与高并发场景下的性能优化与容量规划",
        "推动团队工程质量提升，沉淀通用组件与最佳实践",
    ],
    required_skills=["Go 或 Python", "MySQL", "Redis", "Kafka"],
    preferred_skills=["大规模分布式系统", "Kubernetes"],
    experience_requirements=["本科及以上学历", "5 年以上后端开发经验"],
    soft_skills=["问题定位能力", "团队协作意识"],
)

_WANGFANG_JD_KP = JDKeyPoints(
    position="高级前端工程师（React）",
    responsibilities=[
        "负责核心业务前端应用的架构设计与性能优化",
        "建设与维护组件库、设计系统等前端基础设施",
        "推动前端工程化与质量保障体系落地",
    ],
    required_skills=["React", "TypeScript"],
    preferred_skills=["Next.js", "首屏性能优化"],
    experience_requirements=["本科及以上学历", "4 年以上前端开发经验"],
    soft_skills=["跨团队沟通能力", "技术方案输出能力"],
)

SEED_PERSONAS = [
    SeedPersona(
        username="liming",
        resume_title="李明",
        resume_md="""# 李明

## 基本信息
- 电话：13900001111
- 邮箱：liming@example.com
- 工作年限：6 年后端开发

## 技术栈
精通 Go 与 Python，熟悉 Gin、FastAPI 框架与 gRPC 服务治理。
深入理解 MySQL 索引原理与分库分表方案，有千万级数据量的线上调优经验。
熟悉 Kafka 削峰、Redis 缓存与分布式锁的工程实践，了解 Kubernetes 与服务网格。

## 工作经历
### 晨星云 高级后端工程师（2021.05 – 至今）
负责实时数据管道的架构设计，将 Flink 消费延迟从秒级优化到百毫秒级。
主导服务网格落地，统一了 30 余个微服务的可观测性方案。
设计多租户配额与限流体系，保障大客户流量隔离。

### 蓝湖信息 后端工程师（2018.07 – 2021.04）
参与电商订单中台建设，负责大促期间的限流降级方案，支撑峰值 3 万 QPS。
推动订单库从单库拆分为 16 个分片，慢查询率下降 90%。

## 项目亮点
- 消息推送平台：自研长连接网关，单机承载 20 万连接，丢包率低于 0.01%。
- 规则引擎：基于表达式解析实现风控规则热更新，需求交付周期缩短一半。
- 数据迁移工具：零停机双写迁移方案，累计完成 3 次核心库切换零事故。
""",
        jd_title="高级后端工程师（Go/Python）",
        jd_content="""# 高级后端工程师（Go/Python）

## 岗位职责
1. 负责核心业务微服务的设计、开发与稳定性保障；
2. 参与高并发场景下的性能优化与容量规划；
3. 推动团队工程质量提升，沉淀通用组件与最佳实践。

## 任职要求
- 本科及以上学历，5 年以上后端开发经验；
- 精通 Go 或 Python，熟悉 MySQL、Redis、Kafka 等常用组件；
- 有大规模分布式系统或云原生（Kubernetes）实践经验者优先；
- 具备良好的问题定位能力与团队协作意识。
""",
        jd_key_points=_LIMING_JD_KP,
    ),
    SeedPersona(
        username="wangfang",
        resume_title="王芳",
        resume_md="""# 王芳

## 基本信息
- 电话：13900002222
- 邮箱：wangfang@example.com
- 工作年限：5 年前端开发

## 技术栈
精通 React 与 TypeScript，熟悉 Next.js 服务端渲染与状态管理方案。
深入理解浏览器渲染原理，有首屏性能优化与长列表虚拟滚动的落地经验。
熟悉 Vite 工程化、组件库设计与 Storybook 驱动的组件测试，了解 Webpack 构建优化。

## 工作经历
### 木棉科技 高级前端工程师（2021.03 – 至今）
负责电商主站前端架构升级，将构建产物体积压缩 40%，首屏时间从 3.2s 降至 1.4s。
主导设计系统与组件库建设，沉淀 60+ 通用组件，覆盖 5 条业务线。
搭建前端监控体系，线上问题平均定位时长从小时级降至十分钟内。

### 青藤网络 前端工程师（2019.07 – 2021.02）
参与在线教育直播课堂开发，基于 WebRTC 实现低延迟互动白板。
负责活动页搭建平台的前端部分，支撑运营日均上线 30 个页面。

## 项目亮点
- 可视化搭建平台：拖拽式页面搭建，运营自助上线活动页，开发介入率降为零。
- 监控 SDK：自研前端监控采集 SDK，覆盖 JS 错误、接口异常与性能指标。
- 低代码表单引擎：JSON Schema 驱动动态渲染，表单类需求交付周期缩短 60%。
""",
        jd_title="高级前端工程师（React）",
        jd_content="""# 高级前端工程师（React）

## 岗位职责
1. 负责核心业务前端应用的架构设计与性能优化；
2. 建设与维护组件库、设计系统等前端基础设施；
3. 推动前端工程化与质量保障体系落地。

## 任职要求
- 本科及以上学历，4 年以上前端开发经验；
- 精通 React 与 TypeScript，熟悉 Next.js 或同构渲染方案；
- 有大型站点性能优化（首屏、长列表）实践经验者优先；
- 具备良好的跨团队沟通能力与技术方案输出能力。
""",
        jd_key_points=_WANGFANG_JD_KP,
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
    await session.execute(delete(Resume).where(Resume.user_id.in_(user_ids)))
    await session.execute(delete(JD).where(JD.user_id.in_(user_ids)))
    await session.execute(delete(User).where(User.id.in_(user_ids)))
    await session.commit()
    if stale_vector_ids:
        await delete_resume_vectors(stale_vector_ids)
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
