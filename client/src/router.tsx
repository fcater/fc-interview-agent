import { createBrowserRouter } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { GuestOnly } from '@/components/auth/guest-only'
import { RequireAuth } from '@/components/auth/require-auth'
import { HomePage } from '@/pages/home'
import { StartPage } from '@/pages/start'
import { InterviewPage } from '@/pages/interview'
import { InterviewsPage } from '@/pages/interviews'
import { CandidatePage } from '@/pages/candidate'
import { JdsPage } from '@/pages/jds'
import { ResumesPage } from '@/pages/resumes'
import { PresetsPage } from '@/pages/presets'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'

// M1：业务页为受保护路由（RequireAuth）；登录/注册仅访客可见（GuestOnly）
export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      {
        element: <RequireAuth />,
        children: [
          { index: true, Component: HomePage },
          { path: 'start', Component: StartPage },
          { path: 'resumes', Component: ResumesPage },
          { path: 'jds', Component: JdsPage },
          { path: 'presets', Component: PresetsPage },
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
