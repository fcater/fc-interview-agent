# CLAUDE.md

> 本项目指令文件。ZCode 会加载同内容的 `AGENTS.md`——**修改本文件时请同步更新 AGENTS.md**（两文件内容保持一致）。
> 详细设计与开发依据见 `docs/`（project-scope / tech-stack / roadmap），本文件只保留日常高频约定。

## 项目概述

AI 面试模拟 Agent：基于「简历 + 岗位 JD」的中文模拟面试工具。AI 扮演面试官与求职者双角色，面试后产出结构化评分与复盘。多用户数据隔离。作品项目：组件最少、可本地一键启动、离线可演示（Ollama），无自动化测试负担。

- 后端 `server/`：Python 3.12 + uv；FastAPI + LangChain/LangGraph；SQLAlchemy 2.0 async + Alembic；PostgreSQL（业务 + pgvector 同库）
- 前端 `client/`：pnpm；Vite + React 19 + TS + Tailwind 4 + shadcn/ui；TanStack Query + Zustand；React Router
- LLM 双模式（`APP_LLM_MODE`）：`local` = 本机 Ollama（开发默认，无 key 无外网）；`online` = OpenAI 兼容端点。**不 mock 模型**，任何阶段验收都不得依赖真实 key

## 常用命令

```bash
./dev.sh                                  # 一键启动前后端（Ctrl+C 停止）
cd server && uv run uvicorn app.main:app --port 8000 --reload   # 单独起后端（/docs 看 OpenAPI）
cd server && uv run alembic upgrade head  # 迁移（幂等，仅业务表；向量表由 PGVector 自动建）
cd server && uv run python scripts/seed.py  # 灌入演示/测试数据（幂等；--reset 重建，--with-vectors 向量化）
cd server && uv run ruff check app        # 后端 lint（line-length 100，迁移文件除外）
cd client && pnpm dev                     # 单独起前端（:5173，/api 代理到后端）
cd client && pnpm gen:api                 # 从后端 OpenAPI 生成 src/api/schema.d.ts（需后端运行中）
cd client && pnpm exec tsc -b && pnpm lint # 前端类型检查 + lint
```

数据库：本机 PostgreSQL，库 `fc_interview`；凭据在 `server/.env`（不入库，样例见 `server/.env.example`）。

## 硬性约定（违反 = 返工）

1. **顺序开发**：严格按 roadmap M0→M7 逐阶段，阶段验收通过后才进下一阶段，并更新 README 进度表。当前进度见 README「开发进度」。
2. **提交纪律**：**不要主动 `git commit`**——提交必须由用户明确要求（review / 测试通过后）。改完代码只报告变更内容与验证结果，提交时机由用户决定。
3. **多用户隔离（E7）**：所有业务表与向量检索自写入起必须带 `user_id`；服务层一律从 `Depends(get_current_user)` 注入的当前用户取 user_id，查询条件强制过滤；越权访问返回 404（不泄露资源存在性）。
4. **扩展点不写死（E1–E10，见 tech-stack §5）**：供应商/模型/阈值/解析器/rubric 等全部经接口 + 配置（`app/config.py`，pydantic-settings，环境变量 `APP_` 前缀注入），业务代码不出现具体模型名。
5. **结构化输出（E8）**：LLM 结构化产出一律 `with_structured_output(PydanticModel)`，schema 放 `app/schemas/`；Prompt 模板放 `app/prompts/*.md`（中文 + jinja2 占位，`app/llm/prompts.py` 渲染，StrictUndefined）。
6. **统一错误结构**：业务异常继承 `app/core/exceptions.py` 的 AppError 体系，全局处理器收敛为 `{code, message, detail}`；前端按 `code` 机器码分支。
7. **前端类型契约**：接口类型一律 `pnpm gen:api` 生成，不手写 schema 类型；API 调用统一走 `client/src/lib/api.ts` 封装（自动带 JWT、解析统一错误体）。
8. **凭据不入库**：key/密码/secret 一律环境变量；仓库只提供 `.env.example`。
9. **Prompt 与面向用户的文案用中文**；代码注释风格与现有文件一致（中文，解释“为什么”）。

## 代码风格

- 后端：ruff（lint+format），line-length 100，target py312；依赖版本区间管理在 `pyproject.toml`，改动后 `uv lock && uv sync`。
- 前端：oxlint + `tsc -b`；组件函数式，shadcn/ui 组件放 `src/components/ui/`。
- Alembic 迁移文件不参与 lint（已在 ruff exclude）。

## Sub-agent

- `code-reviewer`：代码评审专用 sub-agent，定义在 `.zcode/agents/code-reviewer.md`（ZCode 项目级 sub-agent 目录）。改动完成后可派发它按本文件「硬性约定」做静态评审；它只读（Read + Bash），不改代码。
- `acceptance-tester`：阶段验收专用 sub-agent，定义在 `.zcode/agents/acceptance-tester.md`。阶段开发完成（评审通过）后派发，按 docs/roadmap.md 对应验收标准做运行时验证：`scripts/seed.py` 准备种子数据 → 逐条取证 → `--clean` 清理数据库；不改代码（Read + Bash）。

> 两个 agent 各自独立上下文：评审管「代码写没写对」（静态约定），验收管「系统跑没跑对」（运行行为）；共享约定单点维护在本文件，agent 定义里只写各自的流程，不复制约定内容。
