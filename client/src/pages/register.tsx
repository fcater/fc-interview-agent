import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

// 与后端 RegisterRequest 一致：用户名 2–32 位字母/数字/下划线/中文，密码 8–72 位
const registerSchema = z
  .object({
    username: z
      .string()
      .min(2, '用户名至少 2 位')
      .max(32, '用户名最多 32 位')
      .regex(/^[\w一-龥]{2,32}$/, '仅支持字母 / 数字 / 下划线 / 中文'),
    password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

type RegisterForm = z.infer<typeof registerSchema>

/** 注册页：注册成功后自动登录进入首页 */
export function RegisterPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((state) => state.setToken)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const mutation = useMutation({
    // 注册 + 自动登录：两步在一个 mutationFn 内完成
    mutationFn: async ({ confirmPassword: _confirm, ...payload }: RegisterForm) => {
      await authApi.register(payload)
      return authApi.login({ username: payload.username, password: payload.password })
    },
    onSuccess: (data) => {
      setToken(data.access_token)
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>创建账号，简历 / JD / 面试数据按账号隔离</CardDescription>
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
                placeholder="2–32 位字母 / 数字 / 下划线 / 中文"
                {...register('username')}
              />
              {errors.username && <FieldError message={errors.username.message} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="至少 8 位"
                {...register('password')}
              />
              {errors.password && <FieldError message={errors.password.message} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <FieldError message={errors.confirmPassword.message} />
              )}
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">{mutation.error.message}</p>
            )}
            <Button className="w-full" type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              注册
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            已有账号？
            <Link className="underline underline-offset-4" to="/login">
              去登录
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
