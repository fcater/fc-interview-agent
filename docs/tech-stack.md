# AI 面试 Agent — 技术选型说明

> 版本：v2.0（定稿） ｜ 日期：2026-09-07
> 依据：[project-scope.md](project-scope.md)
> 本文仅涉及工程与实现细节，不包含业务逻辑。依赖版本以 2026-09-07 为准，工程初始化时锁定为最新稳定版。

---

## 0. 选型原则

1. **作品优先**：组件最少、本地一键启动、代码可展示，不追求工程仪式感（无测试负担）。
2. **扩展点预留**：对应 project-scope §4 的 6 个扩展点，全部通过接口 + 配置实现，不写死供应商。
3. **中文场景优先**：LLM 与 Embedding 均要求中文效果好。
4. **技能与求职方向匹配**：Python 是 AI 应用开发主流生态，LangGraph 为本项目重点实践对象。
5. **框架选成熟线**：LangChain / LangGraph 均为 1.x 稳定版。

---

## 1. 技术栈总览

| 领域 | 选型 | 说明 |
|---|---|---|
| 语言 / 运行时 | Python 3.12+ | 2026 年 AI 应用主流 |
| 包管理 | uv | 锁文件 + 免激活环境 |
| Web 框架 | FastAPI（最新稳定）+ uvicorn | 原生 OpenAPI、内置 SSE（`fastapi.sse`）、Pydantic 校验 |
| AI 编排 | LangChain 1.1.x + LangGraph 1.0.x | LangChain 管模型/提示/结构化输出/RAG 组件；LangGraph 管面试会话状态机 |
| 对话模型 | 不绑定供应商，`init_chat_model` 配置化接入 | local：本机 Ollama 小模型；online：OpenAI 兼容端点或官方集成 |
| Embedding | BGE-M3（SiliconFlow / Ollama 本地） | 1024 维，中文检索效果好，接口可换 |
| 向量库 | PostgreSQL + pgvector（`langchain-postgres`） | 与业务库同实例；自动建表；元数据过滤实现用户隔离 |
| 业务数据库 | PostgreSQL 16 | 单库承载业务 + 向量 |
| ORM / 迁移 | SQLAlchemy 2.0（async）+ Alembic | 仅业务表走迁移；向量表由 PGVector 自动建 |
| 会话持久化 | LangGraph Checkpointer（SQLite） | thread_id = 面试会话 id，支持中断恢复 |
| 认证 | JWT（pyjwt + bcrypt） | user_id 贯穿所有查询与向量过滤；JWT 携带令牌版本（token_version），重新登录作废旧 Token（单会话） |
| API 文档 | FastAPI 自带 OpenAPI | 同时作为前端类型生成源 |
| 可观测性 | 结构化日志；LangSmith 仅预留接入点 | MVP 不引入 |
| 前端框架 | React 19 + Vite + TypeScript | 与团队核心技能一致 |
| 前端数据层 | TanStack Query + Zustand | 服务端状态 / 轻量 UI 状态分离 |
| 前端 UI | Tailwind CSS 4 + shadcn/ui | 聊天界面 + 评分报告定制化需求多 |
| 流式通道 | SSE（后端 `EventSourceResponse`） | 单向流式足够；无语音/视频，不上 WebSocket |
| 部署形态 | Docker Compose（PG，开发与分发同一套）+ 本地起服务 | 开发与演示场景 |

---

## 2. 后端技术栈（server/）

### 2.1 语言与工具链

- **Python 3.12+**；**uv** 管理依赖（`pyproject.toml` + `uv.lock`，`uv run` 免手动建环境）。
- 代码风格：ruff（lint + format），`pyproject.toml` 内配置。

### 2.2 Web 框架：FastAPI

- **OpenAPI 文档自动生成**：router 即文档，无额外组件。
- **SSE 原生支持**：`fastapi.sse.EventSourceResponse` + `ServerSentEvent`，支持 POST 端点流式响应（携带 JWT 所需）。
- 全链路 async：端点 → LangGraph `astream` / 模型 `astream_events`，事件循环贯穿。
- 依赖注入（`Depends`）承载认证与「当前用户上下文」：从 JWT 解析 user_id 注入所有路由与服务（对应隔离兜底，见 §5-E7）。

### 2.3 AI 编排：LangChain + LangGraph

**职责划分**：

| 能力 | 组件 |
|---|---|
| 模型接入与切换 | `langchain.chat_models.init_chat_model`（见 §2.5） |
| 结构化输出 | `model.with_structured_output(PydanticModel)` |
| 流式 | 模型 `astream_events`（token 级）/ 图 `stream(mode="messages")` |
| 文本切片 | `langchain-text-splitters`（中文分隔符定制） |
| Embedding / 向量检索 | `init_embeddings` + `langchain-postgres` PGVector（见 §2.6、§2.7） |
| 面试会话状态机 | LangGraph（见 §2.4） |

### 2.4 LangGraph 面试会话设计

面试会话以 LangGraph 图编排，包含以下状态与节点：

**状态（`InterviewState`，TypedDict）**：

| 字段 | 说明 |
|---|---|
| messages | 全量对话历史（LangChain 消息列表） |
| phase | 会话阶段（开场 / 提问中 / 已结束） |
| question_count / max_questions | 题数进度与上限（配置） |
| current_question | 当前问题（含类型：基础 / 项目 / 技术深挖） |
| context | 简历上下文 + JD 要点 + 检索片段 |
| follow_up_round | 当前题追问轮数（上限配置） |

**图结构（面试官角色）**：

```text
START
  │
  ▼
generate_question ──────────────┐（下一题）
  │                              │
  ▼                              │
wait_answer ⏸ interrupt（等用户回答，Human-in-the-loop）
  │                              │
  │ resume：用户回答              │
  ▼                              │
evaluate_answer ──(判定：追问)──► follow_up ──┘
  │
  ├─(判定：下一题，未达上限)────────────────► generate_question
  └─(判定：结束，达上限 / 用户主动结束)────► evaluate_summary ──► END
```

- 每个节点职责单一：出题、等答、判答、追问、总结评分，输出统一走 `with_structured_output` 的 Pydantic 模型，保证图内流转的数据结构稳定。
- **人工中断**：`wait_answer` 节点调用 `interrupt()` 挂起图执行，FastAPI 端点把当前问题流式返回前端；用户提交回答后以 `Command(resume=...)` 恢复。
- **检查点持久化**：`SqliteSaver`（`langgraph-checkpoint-sqlite`），`thread_id` = 面试会话 id，页面刷新与服务重启后可通过 `get_state` 恢复；后续多实例部署可切换 `PostgresSaver`（复用现有 PG）。
- **流式**：`graph.stream(mode="messages")` 产出 token 块，桥接到 `EventSourceResponse`；阶段切换（出题 / 追问 / 评分）用 `mode="updates"` 或自定义事件通知前端。
- **求职者角色**：第二个独立编译的图，复用同一套节点实现与状态基类，注入不同的提示词与检索逻辑（简历知识库 + 预设答案标签匹配）。

### 2.5 对话模型接入

- 通过 **`init_chat_model`** 工厂按配置构造：`"<provider>:<model>"` 字符串、`model_provider`、超时/温度等参数全部来自配置层，业务代码只见 `BaseChatModel` 协议，代码中不出现具体模型名。
- 两种运行模式（`APP_LLM_MODE`）：
  1. **local**（本地开发）：接入本机 Ollama 小模型（langchain-ollama 集成，默认 `qwen3:8b`），无 key 无外网；
  2. **online**（生产）：OpenAI 兼容端点（DeepSeek、Qwen、SiliconFlow、GLM、vLLM 等，改 base-url + key），或 LangChain 官方集成（Anthropic、Google 等）。
- 供应商与模型名写入 `config.py`（pydantic-settings），环境变量注入。

### 2.6 Embedding

- **BGE-M3（1024 维）**，按运行模式切换（`APP_LLM_MODE`）：
  - local：Ollama `bge-m3`（`OllamaEmbeddings`）；
  - online：SiliconFlow（OpenAI 兼容端点，`init_embeddings("openai:BAAI/bge-m3", base_url=...)`）。
- 维度约束：PGVector 表维度在建表时固定，**切换 Embedding 模型必须保证维度一致或重建向量表**；维度作为配置项，与建表动作对齐。

### 2.7 向量库：pgvector

- `langchain-postgres` 的 `PGVector`，与业务库共用连接：
  - **自动建表**：首次使用自动创建向量表，表结构与当前框架版本严格匹配，无迁移脚本负担；
  - 元数据（user_id、标签、来源）随向量存储，检索时 **`filter={"userId": user_id}` 强制过滤**，实现多用户隔离；
  - 预设答案带标签入库，按「标签 + 相似度阈值」双重匹配（阈值与 topK 为配置项）。
- 换库代价低：依赖 `VectorStore` 接口，备选 Qdrant / Milvus / Chroma（§7-R3）。

### 2.8 业务数据库与 ORM

- **PostgreSQL 16**（开发环境用 docker compose 的 `pgvector/pgvector:pg16` 容器，镜像自带 pgvector，无需本机安装）：业务数据与向量同库同实例，部署最简。
- **SQLAlchemy 2.0（async + asyncpg）+ Alembic**：业务表（user / resume / jd / interview_session / interview_qa / evaluation_report）自 MVP 起带 `user_id` 列并建索引；Alembic 只管业务表，向量表不纳入迁移。
- 服务层统一从依赖注入的当前用户取 user_id，杜绝遗漏（§5-E7）。

### 2.9 认证

- **JWT + bcrypt**：登录签发 Token，前端 `Authorization: Bearer`；`Depends` 解析出当前用户注入路由。
- **单会话（token_version）**：用户表带 `token_version`，每次登录原子 +1 并写入 JWT 的 `ver` claim；`get_current_user` 比对 claim 与库内值，不一致即 401——重新登录（或未来改密码 +1）后旧 Token 立即失效。
- 权限模型 MVP 极简：单角色，**隔离而非鉴权**——安全边界落在「所有查询强制 user_id」（业务查询条件 + 向量检索 filter 双层）。

### 2.10 可观测性

- 结构化日志（loguru）；LLM 薄封装层统一记录 model / tokens / 耗时。
- **LangSmith**：MVP 不接入、不引入依赖，仅在设计上预留接入点（配置开关 + 回调注入），后续视调试需要再做打算。

---

## 3. 前端技术栈（client/）

| 领域 | 选型 | 说明 |
|---|---|---|
| 框架 | React 19 + TypeScript 5 + Vite | 与团队核心技能一致 |
| 路由 | React Router 7（library 模式） | 页面少，标准方案 |
| 服务端状态 | TanStack Query | 登录态、面试列表、简历/JD 等 |
| UI 状态 | Zustand | 面试会话进行态（当前问题、流式缓冲） |
| UI 组件 | Tailwind CSS 4 + shadcn/ui | 聊天界面 + 评分报告 |
| 流式接收 | SSE via fetch `ReadableStream` | `EventSource` 不支持自定义 Header（无法带 JWT），用 fetch 流式读 POST SSE |
| 富文本 | react-markdown + remark-gfm | AI 输出（问题、追问、评分报告）均为 Markdown |
| 表单 | React Hook Form + Zod | 简历/JD 上传、注册登录 |
| 类型契约 | `openapi-typescript` 从 FastAPI OpenAPI 生成 | 接口变更编译期暴露 |

- 流式交互细节：逐段 append + 组件按需重渲染；断线重连提示（后端 checkpoint 支持恢复）；「提前结束面试」按钮 → 调结束接口终止当前生成。
- pnpm 管理依赖；与后端同仓（`client/`）。

---

## 4. 工程化

### 4.1 项目结构

```text
fc-interview-agent/
├── server/                          # Python 后端（uv 工程）
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                  # FastAPI 入口、路由注册
│   │   ├── config.py                # pydantic-settings：模型/embedding/阈值/题数等全部配置
│   │   ├── core/                    # 认证（JWT）、当前用户注入、异常处理、日志
│   │   ├── models/                  # SQLAlchemy 业务表
│   │   ├── schemas/                 # Pydantic DTO（请求/响应/结构化输出）
│   │   ├── routers/                 # 路由层（user / resume / jd / interview / evaluation / record）
│   │   ├── services/                # 业务服务（CRUD、会话编排、脱敏）
│   │   ├── agents/                  # LangGraph 图定义（面试官图 / 求职者图）与节点实现
│   │   ├── knowledge/               # 切片、脱敏、嵌入、检索（PGVector）、标签体系
│   │   ├── llm/                     # LLM 薄封装（工厂、超时/重试/日志）、prompt 模板渲染
│   │   └── prompts/                 # Prompt 模板（.md + jinja2 占位符）
│   ├── migrations/                  # Alembic（仅业务表）
│   └── .env.example                 # 环境变量样例（key 一律环境变量，.env 不入库）
├── client/                          # React 前端（pnpm 工程）
└── docker-compose.yml               # 本地基础设施：postgres（pgvector 镜像）
```

### 4.2 配置管理

- 单文件配置中心：`config.py`（pydantic-settings）聚合全部可调参数——模型、embedding、相似度阈值、题数上限、追问轮数、记忆窗口、LLM 超时/重试。环境变量覆盖，`.env` 不入库。
- 敏感信息（API key、JWT secret、DB 密码）一律环境变量，仓库提供 `.env.example`。

### 4.3 Prompt 管理

- `app/prompts/*.md` + jinja2 渲染，变量缺失在启动期报错（模板加载时校验）。
- 按角色分文件：面试官系统提示、求职者系统提示、追问策略、评分 rubric 模板——rubric 可替换即替换模板文件（§5-E5）。
- 全部 Prompt 中文书写；结构化输出统一走 `with_structured_output` 的 Pydantic schema，与模板解耦。

### 4.4 本地开发环境

- 本地开发使用 **docker compose 的 pgvector 容器**（根目录 `docker-compose.yml`，宿主机端口默认 5433，首次初始化自动创建 `fc_interview` 库与 vector 扩展）；M7 打包分发复用同一 compose 并扩展全栈编排（§4.5）。
- 后端 `uv run uvicorn app.main:app`、前端 `pnpm dev`（根目录 `dev.sh` 一键启动两者，POSIX 脚本与 Docker 内环境一致，不依赖宿主操作系统）。
- **本地开发**：`APP_LLM_MODE=local` 时接入本机 Ollama（对话 `qwen3:8b` + 嵌入 `bge-m3`），无 key 无外网跑通完整面试闭环（面试官与求职者两个方向均可演示）。

### 4.5 构建与部署（演示形态）

- 后端：Dockerfile（uv 构建 → slim 镜像），uvicorn 单进程即可（会话状态持久化于 SQLite checkpointer，多进程/多实例亦可恢复会话）。
- 前端：`vite build` 静态产物，nginx 托管并反代 `/api` 与 SSE 路径（**SSE 需关闭代理缓冲 `proxy_buffering off`**）。

---

## 5. 关键决策与扩展点映射

| # | project-scope 扩展点 | 技术实现 |
|---|---|---|
| E1 | ResumeParser 可扩展 | Python `Protocol` 接口 + 注册表（`dict[str, ResumeParser]`），MVP 实现 Markdown 解析，新增 PDF/Word 解析器即加实现类 |
| E2 | LLM 调用层不写死供应商 | `init_chat_model` 工厂 + 配置注入，业务层只见 `BaseChatModel` 协议；`llm/` 薄封装统一超时、重试、token/耗时日志 |
| E3 | Embedding 与向量库可替换 | `BaseEmbeddings` / `VectorStore` 接口；默认 BGE-M3 + PGVector；维度与建表动作由配置对齐 |
| E4 | 面试官行为配置化 | 图节点为纯函数，出题策略、追问策略为可注入 callable（读配置），后续「人格系统」替换节点实现或注入新策略 |
| E5 | 评分 rubric 可替换 | rubric 为独立 Prompt 模板 + Pydantic 结果 schema；替换模板文件即换评分标准 |
| E6 | 预设答案匹配可调 | 阈值、topK、标签体系均为配置项，集中在 `knowledge/` 模块 |
| E7 | 多用户数据隔离 | 业务表 `user_id` 列 + SQLAlchemy 查询条件；PGVector 检索 `filter={"userId": user_id}`；依赖注入从 JWT 取 user_id，服务层无感兜底 |
| E8 | 结构化输出 | `with_structured_output(PydanticModel)`：出题、判答、评分报告、JD 提取 |
| E9 | 流式输出 | LangGraph `stream(mode="messages")` → `EventSourceResponse` → 前端 fetch SSE |
| E10 | 敏感信息脱敏 | 入库前正则脱敏（手机号/邮箱），位于「解析后、切片前」，独立工具函数 |

---

## 6. 依赖与版本清单

### 后端（pyproject.toml）

| 依赖 | 版本 | 用途 |
|---|---|---|
| langchain | 1.1.x | 核心抽象、模型工厂、结构化输出 |
| langgraph | 1.0.x | 面试会话状态机 |
| langchain-openai | 1.x | OpenAI 兼容端点接入（对话 + 嵌入） |
| langchain-ollama | 1.x | 本地 Ollama 模型（local 模式） |
| langchain-text-splitters | 1.x | 简历/JD 中文切片 |
| langchain-postgres | 1.x | PGVector 向量库（自动建表） |
| langgraph-checkpoint-sqlite | 1.x | 会话检查点持久化 |
| fastapi + uvicorn | 最新稳定 | Web 框架与服务器（含 `fastapi.sse`） |
| sqlalchemy | 2.0.x | ORM（async） |
| alembic | 1.x | 业务表迁移 |
| asyncpg | 0.30.x | 异步 PG 驱动 |
| pydantic + pydantic-settings | 2.x | 校验与配置 |
| pyjwt / bcrypt | 最新稳定 | JWT 签发校验 / 口令哈希 |
| jinja2 | 3.x | Prompt 模板渲染 |
| loguru | 最新稳定 | 结构化日志 |

### 前端（client/package.json 关键项）

| 依赖 | 版本 |
|---|---|
| react / react-dom | 19.x |
| typescript | 5.x |
| vite | 7.x |
| @tanstack/react-query | 5.x |
| zustand | 5.x |
| tailwindcss | 4.x |
| react-router | 7.x |
| react-markdown + remark-gfm | 10.x |
| react-hook-form + zod | 最新稳定 |
| openapi-typescript（dev） | 最新稳定 |

### 基础设施

| 组件 | 版本 / 镜像 |
|---|---|
| PostgreSQL + pgvector | `pgvector/pgvector:pg16` |
| Python | 3.12+ |
| 包管理器 | uv / pnpm |
| Node.js | 22 LTS |

> 版本以工程初始化时最新稳定版为准（LangChain/LangGraph 已 1.0，锁进 `uv.lock` / `pnpm-lock.yaml` 后固定）。

---

## 7. 风险与备选方案

| # | 风险 | 影响 | 缓解 / 备选 |
|---|---|---|---|
| R1 | LangGraph 概念成本（图/状态/检查点学习曲线） | 开发速度 | 图规模刻意做小（6 节点两图），节点为纯函数；备选：纯 LangChain 循环 + 手写状态管理 |
| R2 | 供应商未定、后续切换 | 接入成本 | `init_chat_model` 配置化；接入要求只有两条（OpenAI 兼容 / 官方集成），切换零代码改动 |
| R3 | PGVector 规模上限（单表百万级向量后检索变慢） | MVP 数据量远未触及 | `VectorStore` 接口隔离，备选 Qdrant / Milvus |
| R4 | LLM 输出不稳定（追问跑偏、评分格式漂移） | 体验 | 全部结构化输出 + 温度可配 + 失败重试一次后降级默认结构 |
| R5 | 用户断连/提前结束时图仍在执行 | 资源浪费 | 前端关闭 SSE 触发取消；checkpoint 使会话可恢复，结束动作幂等 |
| R6 | 中文切分质量（固定长度切碎语义） | 检索效果 | `RecursiveCharacterTextSplitter` 定制中文分隔符 + 段落重叠；切片参数做成配置，按实际效果迭代 |
