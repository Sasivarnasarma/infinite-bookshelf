import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

/**
 * Renders model-written Markdown. Raw HTML in the text is never rendered (react-markdown's
 * default), which matters: API keys live in this page's storage.
 */
export const Markdown = memo(function Markdown({ text, className, streaming }: { text: string; className?: string; streaming?: boolean }) {
  return (
    <div className={cn('reading prose max-w-none', streaming && '[&>*:last-child]:stream-caret', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
