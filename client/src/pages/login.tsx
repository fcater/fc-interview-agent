import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

type LoginForm = z.infer<typeof loginSchema>

/** 登录页：JWT 认证（登录成功写入 Token，回跳来源页面） */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setToken = useAuthStore((state) => state.setToken)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setToken(data.access_token)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/', { replace: true })
    },
  })

  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="bg-brand-gradient grid size-12 place-items-center rounded-2xl text-primary-foreground shadow-md shadow-primary/30">
          <Sparkles className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">登录后进入你的 AI 面试训练空间</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>登录后进入个人工作台</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="注册时的用户名"
                {...register('username')}
              />
              {errors.username && <FieldError message={errors.username.message} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <FieldError message={errors.password.message} />}
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">{mutation.error.message}</p>
            )}
            <Button className="w-full" type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              登录
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            还没有账号？
            <Link className="underline underline-offset-4" to="/register">
              去注册
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  return <p className="text-sm text-destructive">{message}</p>
}
