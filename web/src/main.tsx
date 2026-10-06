import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { App } from './App'
import { LogoLoader } from './components/Logo'
import { HomePage } from './pages/HomePage'

// The landing page ships in the main bundle; other pages load on first visit
const router = createBrowserRouter([
  {
    element: <App />,
    // Shown while a lazily loaded page arrives on first load
    hydrateFallbackElement: <LogoLoader className="min-h-dvh bg-background" />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/new', lazy: async () => ({ Component: (await import('./pages/CreatePage')).CreatePage }) },
      { path: '/books', lazy: async () => ({ Component: (await import('./pages/BooksPage')).BooksPage }) },
      { path: '/books/:id', lazy: async () => ({ Component: (await import('./pages/BookPage')).BookPage }) },
      { path: '/settings', lazy: async () => ({ Component: (await import('./pages/SettingsPage')).SettingsPage }) },
      { path: '*', lazy: async () => ({ Component: (await import('./pages/NotFoundPage')).NotFoundPage }) },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
