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
│   ├── Dockerfile       # uv 多阶段构建 → slim 镜像（启动时自动执行迁移）
│   └── .env.example     # 环境变量样例
├── client/              # React 前端（pnpm 工程：Vite + TS + Tailwind 4 + shadcn/ui）
│   ├── Dockerfile       # vite build → nginx 托管 + /api 反代（SSE 关闭代理缓冲）
│   ├── nginx.conf       # 生产反代配置（gzip / SPA 回退 / SSE 长超时）
│   └── src/             # pages / components / stores / lib（API 封装）等
├── docker-compose.yml   # 开发：仅 PG；分发：全栈编排（PG + server + client）
└── docker/init/         # PG 初始化脚本（vector 扩展）
```

## 架构

```text
浏览器
  └─ client 容器（nginx：静态托管 + /api 反代，SSE 关闭代理缓冲即时下发）
       └─ server 容器（FastAPI：REST + SSE；两条独立 LangGraph 图：面试官 / 求职者）
            ├─ PostgreSQL 容器（pgvector：业务表 + 简历/预设向量，同库同实例）
            │    └─ 多用户隔离：业务表 user_id 过滤 + 向量检索 userId 元数据过滤（E7）
            ├─ LangGraph 会话检查点（SqliteSaver，thread_id = 会话 id，随 server 容器卷持久化）
            └─ 模型接入（E2/E3 配置化，业务代码不出现具体模型名）
                 ├─ local：宿主机 Ollama（容器经 host.docker.internal 访问）
                 └─ online：OpenAI 兼容端点
```

## 本地启动

前置：Python 3.12+（[uv](https://docs.astral.sh/uv/)）、Node 22 + [pnpm](https://pnpm.io/)、Docker（开发数据库用 pgvector 容器）、[Ollama](https://ollama.com/)（`APP_LLM_MODE=local` 时需要，见下方「LLM 模式」）。

```bash
# 1. 环境变量（两份都先建好，compose 解析时需要；凭据一律走环境变量，仓库只提供 .env.example）
cp .env.example .env                 # 修改 POSTGRES_PASSWORD
cp server/.env.example server/.env   # 把 APP_DATABASE_URL 改为上一步的 POSTGRES_PASSWORD（账号/端口见样例）

# 2. 数据库：docker compose 仅启动 pgvector 容器（开发模式不构建服务镜像；首次自动建库 + vector 扩展，宿主机端口 5433）
docker compose up -d postgres

# 3. 初始化业务表（Alembic，幂等可重复执行）
cd server && uv run alembic upgrade head

# （可选）灌入演示/测试数据：liming（后端画像）/ wangfang（前端画像）两个账号 + 各自简历与 JD
# 幂等可重复执行；--with-vectors 同步向量化（需本机 Ollama）；--clean 清理种子数据
uv run python scripts/seed.py

# 4. 一键启动后端 + 前端（POSIX 脚本，Linux / macOS / Windows Git Bash 通用；Ctrl+C 停止）
./dev.sh

# 后端 http://localhost:8000（/docs 为 OpenAPI 页面，Postman 直连此端口）
# 前端 http://localhost:5173（浏览器访问，/api 代理到后端）
```

首次运行需先安装依赖：`cd server && uv sync`（Python 3.12 自动下载）、`cd client && pnpm install`。

前端首页会请求后端 `/health` 展示服务状态（后端 / 数据库 / LLM 模式）。

> 开发数据库即上述 pgvector 容器（分发部署复用同一 compose 并扩展全栈编排，见下方「Docker 全栈部署」）。国内网络下 Docker Hub 拉取缓慢时，可经镜像站拉取后打回标准 tag：
> `docker pull docker.1ms.run/pgvector/pgvector:pg16 && docker tag docker.1ms.run/pgvector/pgvector:pg16 pgvector/pgvector:pg16`

## Docker 全栈部署

一键启动全栈（PG + server + client/nginx），适合演示与分发。

前置：Docker；`APP_LLM_MODE=local` 时另需本机 [Ollama](https://ollama.com/) 已启动并拉取模型（见下方「LLM 模式」）。

```bash
# 1. 准备两份环境变量（凭据不入库，样例均在仓库）
cp .env.example .env                 # 修改 POSTGRES_PASSWORD
cp server/.env.example server/.env   # LLM 接入按需修改；APP_DATABASE_URL 无需改（全栈编排自动覆盖为 compose 内网地址）

# 2. 一键构建并启动全栈（server 启动时自动执行 alembic 迁移，幂等）
docker compose up -d --build

# 3. 访问
# 前端 http://localhost:8080   （nginx 托管，/api 自动反代到后端）
# 后端 http://localhost:8000/docs（OpenAPI 页面，可直连调试）
```

说明：

- **local 模式**：server 容器经 `host.docker.internal:11434` 访问宿主机 Ollama（compose 已配 `extra_hosts`，Linux 亦兼容）；Ollama 不在本机时在根目录 `.env` 中设 `APP_OLLAMA_BASE_URL`。
- **online 模式**：在 `server/.env` 中切换 `APP_LLM_MODE=online` 并填写供应商配置后，`docker compose up -d --build server` 重建生效。
- **离线演示**：local 模式全程无外网依赖（模型推理与向量嵌入均走本机 Ollama），适合现场演示。
- 会话检查点（SQLite）持久化于 `server-data` 卷，容器重建后会话可恢复。
- （可选）灌入演示数据（liming / wangfang 两个画像账号）：`docker compose exec server python scripts/seed.py --with-vectors`（需宿主机 Ollama 在线）；`--clean` 清理。

```bash
# 停止（数据卷保留）
docker compose down
# 停止并删除数据卷（业务数据与向量全部清空，慎用）
docker compose down -v
```

> Windows 排障：启动 client 时报 `ports are not available`，是 Hyper-V/WinNAT 动态保留端口段占用了 8080（常见于重启后）。
> 在根目录 `.env` 中设 `CLIENT_PORT=8180`（或其他未保留端口）后重新 `docker compose up -d`；保留段可用
> `netsh interface ipv4 show excludedportrange protocol=tcp` 查看。server 端口同理（`SERVER_PORT`）。

## LLM 模式（local / online）

`APP_LLM_MODE` 决定模型接入方式（不 mock 模型，两种模式都跑真实模型）：

| 模式     | 说明                              | 适用场景         |
| -------- | --------------------------------- | ---------------- |
| `local`  | 本机 Ollama 小模型，无 key 无外网 | 本地开发（默认） |
| `online` | OpenAI 兼容协议的在线模型         | 生产环境         |

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

| 环境变量                             | 说明                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `APP_LLM_MODE`                       | `local` = 本机 Ollama 小模型（开发默认，无 key 无外网）；`online` = 在线模型                               |
| `APP_DATABASE_URL`                   | PostgreSQL 连接串（**必填，无默认值**；凭据与根目录 `.env` 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` 一致） |
| `APP_CHAT_*` / `APP_OLLAMA_BASE_URL` | 对话模型接入（local：Ollama；online：OpenAI 兼容协议，配置化切换供应商）                                   |
| `APP_EMBEDDING_*`                    | Embedding 接入（local：Ollama bge-m3；online：OpenAI 兼容端点，如 SiliconFlow）                            |
| `APP_JWT_*`                          | JWT 签发配置                                                                                               |
| `APP_INTERVIEW_MAX_QUESTIONS` 等     | 面试题数上限、追问轮数、RAG 阈值等行为参数                                                                 |

前端类型契约由 `pnpm gen:api` 从后端 OpenAPI 生成（需后端运行中），产出 `client/src/api/schema.d.ts`。

## 开发进度

| 阶段 | 内容                                        | 状态      |
| ---- | ------------------------------------------- | --------- |
| M0   | 工程骨架（server + client 初始化）          | ✅ 已验收 |
| M1   | 数据层 + 用户体系（注册登录、JWT、隔离）    | ✅ 已验收 |
| M2   | 简历与 JD 管理（解析器接口、脱敏、JD 提取） | ✅ 已验收 |
| M3   | 知识库 RAG（切片、嵌入、向量检索）          | ✅ 已验收 |
| M4   | AI 面试官核心闭环（LangGraph）              | ✅ 已验收 |
| M5   | 面试评估与复盘                              | ✅ 已验收 |
| M6   | AI 求职者（含预设答案匹配）                 | ✅ 已验收 |
| M7   | 部署与收尾                                  | ✅ 已验收 |
