import 'katex/dist/katex.min.css'

import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { prepareMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'

const remarkPlugins = [remarkGfm, remarkMath]

/** react-markdown passes its syntax-tree node as a prop; it mustn't reach the DOM. */
function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props }
  delete rest.node
  return rest
}

// Bad maths shows as red source text instead of breaking the page; \href and friends are off
const rehypePlugins = [
  [rehypeKatex, { throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' }],
  [rehypeHighlight, { detect: false }],
] as const

/**
 * Renders model-written Markdown, with maths (KaTeX) and highlighted code. Raw HTML in the text
 * is never rendered (react-markdown's default), which matters: API keys live in this page's
 * storage.
 */
export const Markdown = memo(function Markdown({ text, className, streaming }: { text: string; className?: string; streaming?: boolean }) {
  const source = useMemo(() => prepareMarkdown(text), [text])
  return (
    <div className={cn('reading prose max-w-none', streaming && '[&>*:last-child]:stream-caret', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins as never}
        components={{
          a: (props) => <a {...withoutNode(props)} target="_blank" rel="noreferrer noopener" />,
          // Wide tables scroll on their own instead of widening the page
          table: (props) => (
            <div className="table-wrap">
              <table {...withoutNode(props)} />
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
