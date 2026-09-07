import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** 注册页占位：M1 接入注册（bcrypt 口令哈希、用户隔离体系） */
export function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>注册登录将在 M1 阶段接入（JWT）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" type="email" placeholder="you@example.com" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input id="username" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" type="password" disabled />
          </div>
          <Button className="w-full" disabled>
            注册（M1 开放）
          </Button>
          <p className="text-center text-sm text-muted-foreground">
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
