import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** 登录页占位：M1 接入 JWT 认证（注册登录闭环、Token 存储、路由守卫） */
export function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>注册登录将在 M1 阶段接入（JWT）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" type="email" placeholder="you@example.com" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" type="password" disabled />
          </div>
          <Button className="w-full" disabled>
            登录（M1 开放）
          </Button>
          <p className="text-center text-sm text-muted-foreground">
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
