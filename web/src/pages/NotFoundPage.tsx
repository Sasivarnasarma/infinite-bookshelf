import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-5 px-4 py-28 text-center">
      <LogoMark live className="w-28" />
      <p className="font-display text-6xl font-medium text-brand">404</p>
      <p className="text-muted-foreground">This page isn't on any shelf.</p>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft /> Back to writing
        </Link>
      </Button>
    </div>
  )
}
