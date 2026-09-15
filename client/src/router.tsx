import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { GuestOnly } from '@/components/auth/guest-only'
import { RequireAuth } from '@/components/auth/require-auth'
import { HomePage } from '@/pages/home'
import { InterviewPage } from '@/pages/interview'
import { InterviewsPage } from '@/pages/interviews'
import { CandidatePage } from '@/pages/candidate'
import { JdsPage } from '@/pages/jds'
import { ResumesPage } from '@/pages/resumes'
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
        children: [
          { index: true, Component: HomePage },
          { path: 'resumes', Component: ResumesPage },
          { path: 'jds', Component: JdsPage },
          { path: 'interviews', Component: InterviewsPage },
          { path: 'interviews/:id', Component: InterviewPage },
          { path: 'candidate/sessions/:id', Component: CandidatePage },
        ],
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
