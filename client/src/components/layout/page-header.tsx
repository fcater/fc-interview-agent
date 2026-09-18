import type { ReactNode } from "react";
import { AiCharacter } from "@/components/ai-character";
import { cn } from "@/lib/utils";

/** 页面标题区：大标题 + 灰色说明 + 右侧 AI 形象（单独占位的视觉锚点）与操作区（多页复用，样式只在此维护） */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  character,
  className,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  /** AI 形象序号（雪碧图 1-6），大屏显示在操作区左侧、单独占据标题行右端 */
  character?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap flex-col justify-center gap-3", className)}>
      {character && <AiCharacter index={character} className="mr-1 hidden h-80 self-center lg:block" />}
      <div className="min-w-0">
        {eyebrow && <p className="text-brand-gradient mb-1 text-xs font-bold tracking-[0.12em] uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
