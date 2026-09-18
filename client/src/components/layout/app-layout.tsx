import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Avatar from "boring-avatars";
import {
  Bell,
  BookMarked,
  Briefcase,
  ClipboardList,
  FileText,
  House,
  LogOut,
  Menu,
  Moon,
  Sparkles,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { interviewApi } from "@/lib/api";
import type { components } from "@/api/schema";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useHealthQuery } from "@/hooks/use-health";
import { useAuthStore } from "@/stores/auth-store";

type HealthResponse = components["schemas"]["HealthResponse"];

const NAV_ITEMS: Array<{ to: string; label: string; icon: typeof House; end?: boolean }> = [
  { to: "/", label: "工作台", icon: House, end: true },
  { to: "/start", label: "开始面试", icon: Sparkles },
  { to: "/interviews", label: "面试记录", icon: ClipboardList },
  { to: "/resumes", label: "我的简历", icon: FileText },
  { to: "/jds", label: "目标岗位", icon: Briefcase },
  { to: "/presets", label: "预设答案", icon: BookMarked },
];

/** 路由 → 顶栏标题（动态详情页显示通用名） */
function pageTitle(pathname: string): string {
  if (pathname === "/") return "工作台";
  if (pathname.startsWith("/start")) return "开始面试";
  if (pathname.startsWith("/resumes")) return "我的简历";
  if (pathname.startsWith("/jds")) return "目标岗位";
  if (pathname.startsWith("/presets")) return "预设答案";
  if (pathname.startsWith("/interviews")) {
    return pathname === "/interviews" ? "面试记录" : "面试会话";
  }
  if (pathname.startsWith("/candidate")) return "求职者练习";
  if (pathname.startsWith("/login")) return "登录";
  if (pathname.startsWith("/register")) return "注册";
  return "Interview Agent";
}

/**
 * 全站布局：深色侧栏 + 顶部 Header。
 * Header 左侧为页面标题（移动端含菜单按钮），右侧为服务状态图标、
 * 通知（评分报告生成中）、夜间模式开关、hash 头像；感知登录态。
 */
export function AppLayout() {
  const token = useAuthStore((state) => state.token);
  const clearToken = useAuthStore((state) => state.clearToken);
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const logout = () => {
    clearToken();
    queryClient.removeQueries({ queryKey: ["me"] });
  };

  return (
    <div className="min-h-svh bg-background">
      {/* 侧栏（桌面固定 / 移动端抽屉） */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={cn(
          "bg-sidebar-gradient fixed inset-y-0 left-0 z-50 flex w-68 flex-col transition-transform duration-200 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-5 lg:justify-start">
          <Link to="/" className="flex items-center gap-3" onClick={() => setDrawerOpen(false)}>
            <BrandMark />
            <div>
              <p className="text-sidebar-accent-foreground text-sm font-semibold">Interview Agent</p>
              <p className="text-xs text-sidebar-foreground/80">AI 面试模拟工作台</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <X />
            <span className="sr-only">关闭菜单</span>
          </Button>
        </div>

        <nav className="grid gap-1.5 px-4">
          {token
            ? NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) => sideNavClass(isActive)}
                >
                  <Icon />
                  {label}
                </NavLink>
              ))
            : null}
        </nav>

        <div className="flex-1" />

        {/* 侧栏底部：登录引导 / 当前用户 */}
        <div className="mx-4 mb-4 rounded-2xl border border-sidebar-border bg-sidebar-accent p-4">
          {token ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sidebar-accent-foreground truncate text-sm font-medium">
                  {me.data?.username ?? "…"}
                </p>
                <p className="text-xs text-sidebar-foreground/80">个人工作区</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={logout}
              >
                <LogOut />
                <span className="sr-only">退出登录</span>
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs leading-relaxed text-sidebar-foreground">
                登录后可管理简历、JD 与面试记录，数据按账号隔离。
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1" onClick={() => setDrawerOpen(false)}>
                  <Link to="/login">登录</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="flex-1 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => setDrawerOpen(false)}
                >
                  <Link to="/register">注册</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区：Header + 页面内容 */}
      <main className="flex min-h-svh flex-col lg:pl-68">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:px-8">
          {/* 左：移动端菜单 + 页面标题 */}
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu />
            <span className="sr-only">打开菜单</span>
          </Button>
          <h2 className="truncate text-sm font-semibold tracking-tight">{pageTitle(location.pathname)}</h2>

          {/* 右：服务状态 / 通知 / 夜间模式 / 头像 */}
          <div className="ml-auto flex items-center gap-1.5">
            <ServiceStatus />
            {token && <NotificationBell />}
            <ThemeToggle />
            {token && <HashAvatar name={me.data?.username ?? "AI"} />}
          </div>
        </header>

        <div className="mx-auto w-full max-w-8xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
      <LlmUnavailableToast />
    </div>
  );
}

/** 后端健康状态图标（/health，30s 轮询，与各页 useLlmReady 共享缓存）：圆点 + 简短文案，悬停查看详情 */
function ServiceStatus() {
  const health = useHealthQuery();

  const state = healthState(health.data, health.isPending, health.isError);

  return (
    <div
      title={state.detail}
      className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground sm:flex"
    >
      <span className={cn("size-1.5 rounded-full", state.dot)} />
      {state.label}
    </div>
  );
}

type HealthState = { dot: string; label: string; detail: string };

/** LLM 不可用提醒（右上角 toast，零依赖）：健康检查转入 llm="down" 时弹一次，6s 后自动消失；
 * 恢复可用时自动关闭，再次故障会重新提醒。 */
function LlmUnavailableToast() {
  const health = useHealthQuery();
  const down = health.data?.llm === "down";
  const [open, setOpen] = useState(false);
  // 渲染期状态调整（React 官方模式）：down 翻转时同步开关 toast，避免 effect 内同步 setState
  const [prevDown, setPrevDown] = useState(down);
  if (down !== prevDown) {
    setPrevDown(down);
    setOpen(down);
  }

  // 自动消失（定时器属于外部系统，effect 中异步关闭不触发级联渲染警告）
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="alert"
      className="animate-in fade-in slide-in-from-top-2 fixed top-16 right-4 z-50 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-foreground shadow-lg"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">LLM 服务不可用</p>
        <p className="mt-0.5 text-xs opacity-90">依赖 AI 的按钮已暂时禁用，服务恢复后自动开启。</p>
      </div>
      <button
        type="button"
        className="ml-1 shrink-0 opacity-70 hover:opacity-100"
        onClick={() => setOpen(false)}
        aria-label="关闭提醒"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** 由 /health 结果推导状态点、文案与悬停明细（提前返回，避免超过 2 层的三元嵌套） */
function healthState(health: HealthResponse | undefined, pending: boolean, error: boolean): HealthState {
  if (error) {
    return { dot: "bg-destructive animate-pulse", label: "服务不可达", detail: "无法连接后端 /health" };
  }
  if (pending || !health) {
    return { dot: "bg-muted-foreground/50", label: "检查中…", detail: "正在检查服务状态" };
  }
  const db = health.database === "up" ? "数据库已连接" : health.database === "down" ? "数据库未连接" : "数据库未知";
  const llm = health.llm === "up" ? "LLM 就绪" : health.llm === "down" ? "LLM 不可用" : "LLM 未知";
  const mode = health.app_llm_mode === "local" ? "local（本机 Ollama）" : "online（在线模型）";
  const detail = `${db}；${llm}（${mode}）${health.detail ? `；${health.detail}` : ""}`;
  if (health.status === "error") {
    return { dot: "bg-destructive animate-pulse", label: "异常", detail };
  }
  if (health.database === "down" || health.llm === "down") {
    return { dot: "bg-warning animate-pulse", label: "已降级", detail };
  }
  return { dot: "bg-success", label: "系统正常", detail };
}

/** 通知铃铛：徽标数 = 评分报告生成中的面试官会话数，点开列出跳转入口 */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const records = useQuery({ queryKey: ["interviews"], queryFn: interviewApi.list });

  // 求职者模式无报告语义；"已完成但评分未出"即生成中
  const pendingReports = (records.data ?? []).filter(
    (r) => r.role === "interviewer" && r.status === "completed" && r.overall_score == null,
  );

  return (
    <div className="relative">
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Bell />
        {pendingReports.length > 0 && !open && (
          <span className="bg-destructive absolute top-1 right-1 size-1.5 rounded-full" />
        )}
        <span className="sr-only">通知</span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="shadow-card absolute right-0 z-40 mt-2 w-72 rounded-xl border bg-card p-1.5">
            <p className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">通知</p>
            {pendingReports.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-muted-foreground">暂无新通知</p>
            ) : (
              <ul className="grid gap-0.5">
                {pendingReports.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/interviews/${r.id}`}
                      onClick={() => setOpen(false)}
                      className="hover:bg-accent flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                    >
                      <span className="bg-warning-soft text-warning-foreground grid size-6 shrink-0 place-items-center rounded-md">
                        <Sparkles className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {r.resume_title ?? "未关联简历"} 的评分报告
                        </span>
                        <span className="text-muted-foreground block text-[11px]">生成中，点击查看最新状态</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 夜间模式开关：持久化到 localStorage，切换 html.dark（.dark 令牌组见 index.css） */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      {theme === "dark" ? <Sun /> : <Moon />}
      <span className="sr-only">切换夜间模式</span>
    </Button>
  );
}

/** hash 头像：boring-avatars（本地 SVG 生成，同一用户名恒定同图） */
function HashAvatar({ name }: { name: string }) {
  return (
    <span className="rounded-full ring-border ring-1" title={name}>
      <Avatar name={name} size={30} variant="beam" />
    </span>
  );
}

function BrandMark() {
  return (
    <div className="bg-brand-gradient grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-md shadow-primary/30">
      <Sparkles className="size-5" />
    </div>
  );
}

function sideNavClass(isActive: boolean): string {
  return cn(
    "text-sidebar-foreground hover:text-sidebar-accent-foreground flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors hover:bg-sidebar-accent",
    isActive && "bg-brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:text-primary-foreground",
  );
}
