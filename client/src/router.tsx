import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { GuestOnly } from '@/components/auth/guest-only'
import { RequireAuth } from '@/components/auth/require-auth'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'

// M1：首页为受保护路由（RequireAuth）；登录/注册仅访客可见（GuestOnly）
export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      {
        element: <RequireAuth />,
        children: [{ index: true, Component: HomePage }],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', Component: LoginPage },
          { path: 'register', Component: RegisterPage },
        ],
      },
    ],
  },
])
