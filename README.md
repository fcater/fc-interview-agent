# fc-interview-agent

AI 面试模拟 Agent：基于「个人简历 + 目标岗位 JD」的中文模拟面试工具，支持 AI 扮演面试官与求职者两种角色，面试结束后产出结构化评分与复盘报告。多用户数据隔离。

## 项目文档

- [docs/project-scope.md](docs/project-scope.md) — 项目范围：目标、核心功能、扩展点、MVP 边界
- [docs/tech-stack.md](docs/tech-stack.md) — 技术选型：Python + LangChain + LangGraph / FastAPI / PostgreSQL + pgvector / React
- [docs/roadmap.md](docs/roadmap.md) — 开发 Roadmap：M0–M7 阶段任务与验收标准

## 目录结构

```text
fc-interview-agent/
├── server/              # Python 后端（uv 工程：FastAPI + LangChain + LangGraph）
│   ├── app/             # main.py / config.py + core/models/schemas/routers/services/agents/knowledge/llm/prompts
│   ├── migrations/      # Alembic（仅业务表，M1 起）
│   └── .env.example     # 环境变量样例
├── client/              # React 前端（pnpm 工程：Vite + TS + Tailwind 4 + shadcn/ui）
├── docker-compose.yml   # 本地基础设施：PostgreSQL（pgvector 镜像）
└── docker/init/         # PG 初始化脚本（vector 扩展）
```

## 本地启动

前置：Python 3.12+（[uv](https://docs.astral.sh/uv/)）、Node 22 + [pnpm](https://pnpm.io/)、本机 PostgreSQL、[Ollama](https://ollama.com/)（`APP_LLM_MODE=local` 时需要，见下方「LLM 模式」）。

```bash
# 1. 数据库：在本机 PostgreSQL 上创建业务库 + 专用账号（开发不使用 Docker）
psql -U postgres -c "CREATE ROLE fc_interview LOGIN PASSWORD '<你的密码>';"
psql -U postgres -c "CREATE DATABASE fc_interview OWNER fc_interview;"

# 2. 配置环境变量（凭据一律走环境变量，仓库只提供 .env.example）
cp server/.env.example server/.env   # 把 APP_DATABASE_URL 改为上一步创建的账号密码

# 3. 一键启动后端 + 前端（分别开两个窗口，双击或命令行运行）
dev.bat

# 后端 http://localhost:8000（/docs 为 OpenAPI 页面，Postman 直连此端口）
# 前端 http://localhost:5173（浏览器访问，/api 代理到后端）
```

> 注意：M3（知识库 RAG）需要 **pgvector 扩展**，官方 PostgreSQL 安装默认不含 pgvector——需在 M3 前为本机 PG 安装对应版本（[pgvector Releases](https://github.com/pgvector/pgvector/releases) 按 PG 18 选择），随后执行：
> `psql -U postgres -d fc_interview -c "CREATE EXTENSION vector;"`

首次运行需先安装依赖：`cd server && uv sync`（Python 3.12 自动下载）、`cd client && pnpm install`。

前端首页会请求后端 `/health` 展示服务状态（后端 / 数据库 / LLM 模式）。

> Docker 仅用于最终打包分发（M7，根目录 docker-compose.yml 起 PG pgvector 镜像），本地开发无需启动。国内网络下 Docker Hub 拉取缓慢时，可经镜像站拉取后打回标准 tag：
> `docker pull docker.1ms.run/pgvector/pgvector:pg16 && docker tag docker.1ms.run/pgvector/pgvector:pg16 pgvector/pgvector:pg16`

## LLM 模式（local / online）

`APP_LLM_MODE` 决定模型接入方式（不 mock 模型，两种模式都跑真实模型）：

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `local` | 本机 Ollama 小模型，无 key 无外网 | 本地开发（默认） |
| `online` | OpenAI 兼容协议的在线模型 | 生产环境 |

### local（本机 Ollama，默认）

1. 安装并启动 [Ollama](https://ollama.com/)（默认监听 `http://localhost:11434`）
2. 拉取模型：

   ```bash
   ollama pull qwen3:8b   # 对话模型（内存紧张可换 qwen3:4b，改 APP_CHAT_MODEL 即可）
   ollama pull bge-m3     # Embedding 模型（1024 维）
   ```

3. `server/.env` 保持 `APP_LLM_MODE=local`（其余 local 配置为默认值，见 [server/.env.example](server/.env.example)）

### online（在线模型）

`server/.env` 中改为 `APP_LLM_MODE=online`，并按供应商填写 `APP_CHAT_PROVIDER` / `APP_CHAT_MODEL` / `APP_CHAT_BASE_URL` / `APP_CHAT_API_KEY` 及 `APP_EMBEDDING_*`（OpenAI 兼容协议，样例见 server/.env.example）。

## 配置

后端全部配置集中于 [server/app/config.py](server/app/config.py)（pydantic-settings），由环境变量注入，样例见 [server/.env.example](server/.env.example)（复制为 `server/.env` 后按需修改；`.env` 不入库）。分发部署时 PG 容器凭据由根目录 `.env` 注入 docker-compose（样例 [.env.example](.env.example)）。

关键项：

| 环境变量 | 说明 |
|---|---|
| `APP_LLM_MODE` | `local` = 本机 Ollama 小模型（开发默认，无 key 无外网）；`online` = 在线模型 |
| `APP_DATABASE_URL` | PostgreSQL 连接串（**必填，无默认值**；凭据与根目录 `.env` 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` 一致） |
| `APP_CHAT_*` / `APP_OLLAMA_BASE_URL` | 对话模型接入（local：Ollama；online：OpenAI 兼容协议，配置化切换供应商） |
| `APP_EMBEDDING_*` | Embedding 接入（local：Ollama bge-m3；online：OpenAI 兼容端点，如 SiliconFlow） |
| `APP_JWT_*` | JWT 签发配置 |
| `APP_INTERVIEW_MAX_QUESTIONS` 等 | 面试题数上限、追问轮数、RAG 阈值等行为参数 |

前端类型契约由 `pnpm gen:api` 从后端 OpenAPI 生成（需后端运行中），产出 `client/src/api/schema.d.ts`。

## 开发进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 工程骨架（server + client 初始化） | ✅ 已验收 |
| M1 | 数据层 + 用户体系（注册登录、JWT、隔离） | ⬜ |
| M2 | 简历与 JD 管理（解析器接口、脱敏、JD 提取） | ⬜ |
| M3 | 知识库 RAG（切片、嵌入、向量检索） | ⬜ |
| M4 | AI 面试官核心闭环（LangGraph） | ⬜ |
| M5 | 面试评估与复盘 | ⬜ |
| M6 | AI 求职者（含预设答案匹配） | ⬜ |
| M7 | 部署与收尾 | ⬜ |
