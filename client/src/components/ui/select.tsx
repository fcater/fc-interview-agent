import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 主题化原生 select：外观与 Input 一致（圆角/描边/焦点环），右侧覆盖主题箭头。
 * 保留原生 select 以获得移动端原生滚轮与键盘体验；业务代码仍直接写 <option>。
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-input bg-card pr-8 pl-3 text-sm outline-none transition-colors',
          'hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
    </div>
  )
}

export { Select }
