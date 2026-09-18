# UI 视觉重构迁移记录（待审查）

> 背景：按 `client/ai-interview-agent-ui-prototype.html` 原型与 UI 设计图重构前端视觉。
> 约束：仅视觉层改动，功能逻辑不变；颜色全部令牌化（`src/index.css`），业务代码不硬编码色值。
> 本文档记录迁移过程中的取舍与拿不准的问题，供人工审查。

## 已落地的设计方向

- **整体风格**：深海军蓝侧栏 + 浅紫白画布 + 白色大圆角卡片 + 靛紫主色（与原型/设计图一致）。
- **主题令牌**：全部收敛在 `client/src/index.css` 的 `:root`（shadcn 语义变量 + 扩展变量 `--success/--warning/--info` 与侧栏品牌色）。业务代码只允许用语义类（`bg-card`、`text-muted-foreground`、`bg-primary` 等）。
- **字体**：Geist Variable（原有依赖）+ 中文回退 PingFang SC / Microsoft YaHei；标题用 `font-heading`。
- **布局**：由「顶部导航条」改为「左侧深色侧栏」（侧栏语义变量 `--sidebar` 系列驱动）；移动端折叠为顶部栏 + 抽屉。

## 设计图 vs 原型的取舍

| # | 事项 | 设计图 | 原型 | 采纳 | 说明 |
|---|------|--------|------|------|------|
| 1 | 主色 | 蓝紫渐变（#4f5ed7 一带） | 靛蓝 #4c55e8 | 原型靛蓝 | 与 shadcn `--primary` 语义贴合，双色渐变仅用于品牌标/按钮高光 |
| 2 | 侧栏底部卡片 | Today's Focus（待办进度） | 今日训练进度 | 静态占位 | 项目无"每日任务"数据源，先放引导文案；见待确认 Q1 |
| 3 | 首页 Hero 3D 插画 | 人物插画 | 无（渐变卡片） | 渐变+光斑装饰 | 不引入图片资源，保持零资产依赖；见待确认 Q2 |
| 4 | At a Glance 彩色统计卡 | 蓝/紫/绿/橙四色图标 | 无对应 | 映射到服务状态/账号卡 | 统计数据源不同，用彩色图标语言迁移 |

## 待确认问题（需人工裁决）

- **Q1 侧栏底部"今日训练进度"**：原型有该卡片但无真实数据支撑。当前实现为静态引导卡（点击跳首页）。是否需要后端补一个"今日完成面试数"聚合接口后接真数据？
- **Q2 首页 Hero 插画**：设计图有 3D 人物插画。当前用 CSS 渐变光斑 + AI 徽章代替，未使用位图。若接受位图，可后补 SVG/图片资源。
- **Q3 深色模式**：设计图仅有浅色。第二轮已按用户要求在 Header 加夜间模式开关（`.dark` 令牌组 + localStorage 持久化）；深色下的视觉细节未经设计稿比对，属"可用但未精修"。
- **Q4 旧文件处置**：`client/ai-interview-agent-ui-prototype.html`（原型 demo）已迁移完成并删除；`client/i3K*.jpg`（设计图）暂保留在 client/ 根目录供人工验收比对，验收后可自行删除；`vite-m4.log` 疑似历史遗留日志，未动，待确认。
- **Q5 面试页三栏布局**：原型面试页有右侧"AI 实时分析"栏，但现有后端无对应实时数据流（评估是逐题事件），故只做双栏（进度 + 聊天），评估内容并入聊天气泡流。

## 第二轮：顶部 Header（按用户反馈补充）

- **Header 结构**：左侧页面标题（按路由映射，移动端含抽屉按钮）；右侧服务状态图标、通知铃铛、夜间模式开关、hash 头像。原移动端专用顶栏已并入该 Header。
- **服务状态**（Q6）：原首页"服务状态"卡片迁至 Header 右侧，改为"彩色圆点 + 简短文案"胶囊（正常绿 / 降级黄 / 异常红且闪烁 / 不可达红），悬停 title 显示数据库与 LLM 模式详情，30s 轮询 /health。
- **通知**（Q7）：后端无通知系统，现实现为"评分报告生成中"提醒——徽标数 = 已完成但综合分未出的面试官会话数，下拉列出跳转入口。若后续要真实通知中心需后端支持。
- **夜间模式**：`.dark` 令牌组本就存在，Header 开关切换 `html.dark` 并持久化 localStorage（key: `theme`，默认浅色）。
- **hash 头像**（Q8）：选用 [boring-avatars](https://www.npmjs.com/package/boring-avatars)（MIT，周下载 15 万+，beam 变体，本地 SVG 生成零网络请求，同一用户名恒定同图）。颜色用库默认调色板而非项目主题色——其 colors prop 不支持 CSS 变量，若要与主题联动需监听主题变化读 computedStyle，暂认为不值得，待裁决。
- **首页清理**：删除"我的账号"卡片（用户名仍在侧栏底部与头像）；"服务状态"卡片删除；hero 深色卡上原先写死的"系统正常"装饰一并移除（真实状态以 Header 为准）。
- **新增依赖**：`boring-avatars@2.0.4`（唯一新增）。

## 第四轮：各页面内容分布对齐 demo（保留第三轮样式细节）

> 用户反馈："样式细节设计得很好，但 demo 的内容分布更合理"——保留视觉令牌，按 demo 重排页面内容结构。

### 路由与导航

- 新增 `GET /start`（`StartPage`）路由与侧栏项"开始面试"；新增 `GET /presets`（`PresetsPage`）路由与侧栏项"预设答案"。`router.tsx` 与 `app-layout.tsx` 中 `NAV_ITEMS` 已同步。
- `app-layout.tsx` 的 `pageTitle()` 增加 `/start`、`/presets`、详情页通用名映射。

### 页面级调整

- **home（仪表盘）**：hero（保留渐变+光斑）→ 四格 StatCard（累计面试 / 平均得分 / 最高得分 / 简历素材库，tone 着色 hint）→ `lg:grid-cols-[1.35fr_.9fr]` 左右栏：左侧最近面试列表（取前 4 条）、右侧得分趋势 recharts `BarChart`（`fill="var(--primary)" radius={[7,7,3,3]}`）。
- **start（新建）**：左卡表单（选择简历 Select / JD 可选 Select / 面试模式二选一卡片：选中态 `border-primary/60 bg-accent ring-primary/15 ring-3`）+ 右卡 CHECKLIST（四项含 jdId 条件文案）；`start` mutation 按 `mode` 分流 `interviewApi.start` / `candidateApi.start`。Select 默认值通过渲染期派生（`resumeChoice ?? resumes.data?.[0]?.id`）实现"1 个以上 option 自动选中"，避免 set-state-in-effect。
- **interview（三栏壳）**：`lg:grid lg:grid-cols-[250px_minmax(0,1fr)]`；左侧进度面板（candidate-card + 面试进度 step-list，按 `TYPE_CYCLE = ['basic','project','deep_dive']` 轮换；当前轮次 `X / maxQuestions`；提前结束 danger 按钮）；移动端隐藏左栏，进度移入主区顶栏 `SessionProgress`。结束后追加 `ReportSection` + `QaReview` 逐题复盘手风琴。
- **report-view**：`lg:grid-cols-[290px_1fr]`——左深蓝分数卡（conic-gradient 环，内盘 `bg-sidebar`，tier 文案 ≥85 表现出色 / ≥70 本次表现不错 / 否则继续加油）；右维度 2×2 卡；下方主要问题 / 改进建议双栏（编号 `String(i+1).padStart(2,'0')`）。**雷达图移除**（demo 无对应元素，且 4 维 radar 几何上不优）。
- **candidate**：左练习面板（练习流程 4 步 init/ask/answer/critique 状态推导 `stepState`、当前轮次第 N 问、结束练习 danger）；点评回答 + PresetManager 移入 Composer 的 `actions`（demo compose-bottom 位置）。
- **interviews**：PageHeader + ＋新建面试（→/start）；筛选条 Search 图标 Input（搜索岗位/简历）+ Select（全部模式 / AI 面试官 / AI 求职者）；行内角色图标芯片 + score 颜色（≥80 `text-success` 否则 `text-warning-foreground`）+ 行动按钮（继续会话 / 查看报告 / 继续练习）。
- **resumes / jds / presets**：统一模式 PageHeader（actions 主按钮开 Dialog）→ 资源卡片网格 `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`（标题 / 摘要 / 标签行 / footer 更新时间 + 查看详情 + Trash2 删除）→ 新建与详情 Dialog。偏差：`ResumeBrief`/`JDBrief` 列表接口无 content 字段，简历摘要改固定脱敏说明文案，JD 摘要由 key_points 拼装；presets 详情不做 Dialog（卡片 `line-clamp-3`）。

### 类型与工程

- **修复 interview.tsx QaReview 的 3 个 TS2339**：`ChatMessage` 是联合类型，`.filter()` 布尔谓词无法跨链窄化到 `.map()`（filter 返回 `ChatMessage[]` 而非窄化后类型），且 user 变体无 `kind`。改写为 `messages.forEach` 循环 + 判别字段收窄（`m.role !== 'assistant' || m.kind !== 'question'` early return），TS 可正确窄化到 question 变体访问 `questionIndex` / `followUpRound`；assessment 取值用 `next?.role === 'assistant' && next.kind === 'assessment'` 同样收窄后访问 `content`，去掉 `as string | null` 强制断言。
- **Q5 右栏处理更新**：面试页右栏仍省略（无实时分析数据源），但评估内容并入聊天流以 `assessment` 气泡呈现，结束后通过 `QaReview` 二次呈现。
- **Select 默认值**：渲染期派生 `resumeId = resumeChoice ?? resumes.data?.[0]?.id ?? null`、JD 用 `'none'` 哨兵区分"明确不使用"。
- **文件保留**：`ai-interview-agent-ui-prototype.html` 已恢复（288 行），与 `i3K*.jpg` 仍在 `client/` 根目录供人工验收比对。

## 第五轮：AI 形象雪碧图接入（用户指定）

- **资产**：`client/public/AI-character.png`（1536×1024，3 列 × 2 行网格，单格 512×512，背景透明，GPT 生成）。
- **组件**：`src/components/ai-character.tsx` —— `AiCharacter({ index, className })`，用 `background-size/position` 按序号裁切对应格子（纯 CSS 裁切，不切图）；`aspect-square` + aria-hidden 装饰语义。
- **放置**（用户指定序号映射，从左到右从上到下）：1 主页 hero 右下 / 2 目标岗位 / 3 预设答案 / 4 我的简历 / 5 开始面试 / 6 面试记录。
- **第五轮两轮迭代，最终定为 header 方案**：
  - 初版：PageHeader 加 character 插槽（标题行右侧）→ 用户反馈"不要以 Header 形式插入，像首页一样融入内容"。
  - 二版：形象移入内容区（资源页空状态 + 网格末位吉祥物、面试记录筛选条右端、开始面试清单卡 CardAction 位）→ 用户反馈"效果不是很好，还是单独占用一行，采用之前的 header 方案"。
  - **终版**：PageHeader 重建（组件曾被随二版调整删除后恢复），恢复 character 插槽——形象 `h-28 self-end ml-auto` 独立于标题与操作区、lg+ 显示；创建按钮（添加岗位 JD / 上传简历 / 新建答案 / 新建面试）回归 PageHeader actions，二版临时工具条与网格/空状态/工具条落位全部移除。序号映射不变（1 主页 hero 内、2 目标岗位、3 预设答案、4 我的简历、5 开始面试、6 面试记录）。
- 顺手清理：`login.tsx` / `register.tsx` 行首 BOM 字符（此前批量替换残留，lint 警告源）。

## 第六轮：LLM 健康检测与按钮禁用联动（2026-09-18）

### 后端 /health 增强

- `HealthResponse` 新增 `llm: "up" | "down" | None`；`main.py` 新增 `_ping_llm()`（`asyncio.to_thread` 包同步 urllib，零新增依赖）：local 模式探 `{ollama_base_url}/api/tags`，online 模式探 `{chat_base_url}/models`，2s 超时，任何失败（含未配置 chat_base_url）返回 down 不上抛；db + llm 双探测 `asyncio.gather` 并行，任一 down 则 `status="degraded"`。`schema.d.ts` 已重新生成。

### 前端联动

- **`src/hooks/use-health.ts`（新增）**：`useHealthQuery()`（与 ServiceStatus 共享 `["health"]` 30s 轮询缓存，零额外请求）+ `useLlmReady()`。语义经用户两轮反馈最终定为：**仅 `llm === "up"` 时返回 true**——页面初始加载 / 字段缺失（旧后端）/ down 一律视为不可用（"最开始是不可用的，只有 llm 健康才恢复可用"；代价：旧后端下按钮恒禁用，需运行新后端代码）。
- **禁用范围**（统一追加 `!llmReady` 条件）：
  - start：创建面试；home：hero「开始一次面试」；interviews：「新建面试」+ 行内「继续会话/继续练习」（仅 `in_progress` 禁用，查看报告只读不禁用）；resumes：「上传简历」入口 + Dialog 提交（embedding 向量化依赖模型服务）；jds：「AI 提取关键点」（**保存 JD 不经 LLM 保持可用**）；interview：Composer 输入/发送、提前结束 ×2、报告「手动生成」；candidate：Composer、点评回答、结束练习 ×2。**预设答案增删改全程可用**。
  - interview/candidate 两页「自动开流」effect 加 `llmReady` 门控（deps 含 `llmReady`，健康恢复后自动续接首题/初始化流）。
  - Link 型按钮（`Button asChild` 渲染为 `<a>`）不匹配 CSS `:disabled` 伪类，改用条件类 `pointer-events-none opacity-50` + `aria-disabled`，视觉与真禁用一致。
- **右上角 toast（零依赖）**：`LlmUnavailableToast`（app-layout.tsx）——健康检查转入 `down` 时弹「LLM 服务不可用：依赖 AI 的按钮已暂时禁用，服务恢复后自动开启」，6s 自动消失、可手动关，恢复后再故障重新提醒；warning 语义色 + `animate-in` 滑入，位于 `fixed top-16 right-4`（Header 下方）。实现用渲染期状态调整（React 官方模式）+ 定时器 effect，规避 oxlint `set-state-in-effect` 警告。

## 变更文件清单（累计）

- `src/index.css`：主题令牌全部重写（新增品牌色/成功/警告/信息变量与侧栏变量）
- `src/components/layout/app-layout.tsx`：顶栏布局 → 深色侧栏布局（含移动端抽屉）；第四轮新增 `/start`、`/presets` 导航项与标题映射；第六轮新增 `LlmUnavailableToast`
- `src/components/ui/{button,card,input,textarea,dialog,label,select}.tsx`：圆角/高度/配色对齐新主题；`select.tsx` 第三轮新增（主题化原生 select）
- `src/components/chat/chat.tsx`：第三轮新增（ChatBubble/ChatMeta/SoftBadge/SessionProgress/Composer 共用组件）
- `src/components/layout/page-header.tsx`：第四轮新增；第五轮曾随「去 Header 化」二版删除，终版恢复并带 character 插槽
- `src/components/ai-character.tsx`：第五轮新增（雪碧图 CSS 裁切）；`public/AI-character.png` 为对应资产
- `src/hooks/use-health.ts`：第六轮新增（useHealthQuery / useLlmReady）
- `src/pages/{home,start,interview,interviews,candidate,resumes,jds,presets}.tsx`、`src/components/report/report-view.tsx`、`src/components/presets/preset-manager.tsx`：语义类替换 + 第四轮内容分布重排 + 第六轮 LLM 禁用条件
- `src/router.tsx`：新增 `/start`、`/presets` 路由
- 后端（第六轮）：`server/app/main.py`、`server/app/schemas/health.py` —— /health 增加 LLM 连通性探测
- 功能逻辑（stores/api）零改动；`interview-store.ts` / `candidate-store.ts` API 未变
