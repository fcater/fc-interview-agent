import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { candidateApi, interviewApi, jdApi, resumeApi } from "@/lib/api";
import { useLlmReady } from "@/hooks/use-health";

type Mode = "interviewer" | "candidate";

/** 开始面试页：选择简历 / JD / 模式（二选一卡片），右侧展示本次面试使用的上下文清单 */
export function StartPage() {
  const navigate = useNavigate();
  const llmReady = useLlmReady();
  const resumes = useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });
  const jds = useQuery({ queryKey: ["jds"], queryFn: jdApi.list });

  // 未手动选择时渲染期派生为第一项：列表加载即自动选中
  const [resumeChoice, setResumeChoice] = useState<number | null>(null);
  // null = 未操作（自动选第一份）；'none' = 用户明确选择不使用 JD；number = 指定 JD
  const [jdChoice, setJdChoice] = useState<number | "none" | null>(null);
  const resumeId = resumeChoice ?? resumes.data?.[0]?.id ?? null;
  const jdId = jdChoice === null ? (jds.data?.[0]?.id ?? null) : jdChoice === "none" ? null : jdChoice;
  const [mode, setMode] = useState<Mode>("interviewer");

  const start = useMutation({
    mutationFn: async () => {
      if (!resumeId) throw new Error("请先选择简历");
      return mode === "interviewer"
        ? interviewApi.start({ resume_id: resumeId, jd_id: jdId })
        : candidateApi.start({ resume_id: resumeId });
    },
    onSuccess: (session) => {
      void navigate(mode === "interviewer" ? `/interviews/${session.id}` : `/candidate/sessions/${session.id}`);
    },
  });

  const MODES: Array<{ key: Mode; title: string; desc: string }> = [
    { key: "interviewer", title: "AI 面试官", desc: "AI 根据简历 + JD 提问、判答、动态追问。" },
    { key: "candidate", title: "AI 求职者", desc: "你来当面试官，AI 以简历主人身份回答并接受点评。" },
  ];

  const CHECKLIST = [
    { title: "个人简历知识", desc: "从简历切片中检索项目、技术栈与经历。" },
    {
      title: "岗位关键点",
      desc: jdId ? "JD 的 required skills 作为出题与深挖依据。" : "本次未绑定 JD，将仅基于简历提问。",
    },
    { title: "动态追问", desc: "根据上一轮回答决定继续深挖还是进入下一题。" },
    { title: "结构化复盘", desc: "结束后生成综合分、维度评分、问题与改进建议。" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="开始一次面试"
        description="选择简历和目标岗位，AI 会据此生成本次面试的上下文。"
        character={5}
      />
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <Card>
          <CardContent className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">选择简历</span>
              <Select
                value={resumeId ?? ""}
                onChange={(e) => setResumeChoice(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="" disabled>
                  {resumes.isPending ? "加载中…" : resumes.data?.length ? "请选择简历" : "暂无简历"}
                </option>
                {resumes.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                目标岗位 JD <span className="font-normal text-muted-foreground">（可选）</span>
              </span>
              <Select
                value={jdId ?? ""}
                onChange={(e) => setJdChoice(e.target.value ? Number(e.target.value) : "none")}
              >
                <option value="">不绑定岗位 JD</option>
                {jds.data?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </label>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">面试模式</span>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={cn(
                      "rounded-xl border bg-card p-4 text-left transition-all",
                      mode === m.key ? "border-primary/60 bg-accent ring-primary/15 ring-3" : "hover:border-ring/50",
                    )}
                  >
                    <b className="text-sm">{m.title}</b>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {start.isError && <p className="text-sm text-destructive">{start.error.message}</p>}

            <div className="flex justify-end gap-2.5 border-t pt-4">
              <Button variant="outline" onClick={() => void navigate("/")}>
                取消
              </Button>
              <Button disabled={!llmReady || !resumeId || start.isPending} onClick={() => start.mutate()}>
                {start.isPending ? "正在创建…" : "创建面试"}
                <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">本次面试会使用</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3.5">
            {CHECKLIST.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="bg-accent text-primary mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg">
                  <Check className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
