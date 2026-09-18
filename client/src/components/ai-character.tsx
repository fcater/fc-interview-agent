import { cn } from "@/lib/utils";

// 雪碧图网格：3 列 × 2 行，序号从左到右、从上到下（1-6）
const COLS = {
  1: 2.9,
  2: 2.8,
  3: 2.8,
  4: 2.95,
  5: 2.9,
  6: 2.9,
};
const ROWS = 2;

/**
 * AI 形象（public/AI-character.png 雪碧图）。
 * 通过 background-size/position 按序号裁切显示对应角色，PNG 背景透明可直接叠放在卡片上。
 * 序号映射：1 主页 · 2 目标岗位 · 3 预设答案 · 4 我的简历 · 5 开始面试 · 6 面试记录。
 */
export function AiCharacter({ index, className }: { index: 1 | 2 | 3 | 4 | 5 | 6; className?: string }) {
  const cols = COLS[index] || COLS[1]; // 预设答案页的角色图略宽，单独处理
  const col = (index - 1) % cols;
  const row = Math.floor((index - 1) / cols);
  return (
    <div
      aria-hidden
      className={cn("aspect-square bg-no-repeat", className)}
      style={{
        backgroundImage: "url(/AI-character.png)",
        backgroundSize: `${cols * 100}% ${ROWS * 100}%`,
        backgroundPosition: `${(col / (cols - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
      }}
    />
  );
}
