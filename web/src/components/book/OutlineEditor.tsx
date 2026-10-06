import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, ChevronRight, Ellipsis, GripVertical, PenLine, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { Menu, MenuContent, MenuItem, MenuTrigger, Tooltip } from '@/components/ui/overlays'
import { updateBook } from '@/lib/db'
import { outlineToRows, rowsToOutline, type OutlineLevel, type OutlineRow } from '@/lib/outline'
import { draftOutline, writeBook } from '@/lib/runner'
import type { Book } from '@/lib/types'
import { cn, newId } from '@/lib/utils'

const LEVEL_NAMES: Record<OutlineLevel, string> = { 1: 'Chapter', 2: 'Section', 3: 'Subsection' }

function Row({
  row,
  index,
  isHeading,
  onChange,
  onRemove,
}: {
  row: OutlineRow
  index: number
  isHeading: boolean
  onChange: (patch: Partial<OutlineRow>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })
  return (
    <motion.li
      ref={setNodeRef}
      // Opacity only: dnd-kit owns `transform` while dragging
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index, 20) * 0.015 }}
      style={{ transform: CSS.Transform.toString(transform), transition, '--indent': row.level - 1 } as React.CSSProperties}
      className={cn('group relative pl-[calc(var(--indent)*0.85rem)] sm:pl-[calc(var(--indent)*1.75rem)]', isDragging && 'z-10')}
    >
      <div
        className={cn(
          'flex items-start gap-1.5 rounded-xl border border-transparent p-1.5 transition-colors hover:border-border hover:bg-muted/40',
          isDragging && 'border-border bg-card shadow-xl',
          row.level === 1 && 'mt-2',
        )}
      >
        <button
          type="button"
          className="mt-1.5 cursor-grab touch-none rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing pointer-coarse:mt-0 pointer-coarse:-ml-1 pointer-coarse:p-3"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
          <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span
              className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                row.level === 1 ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {LEVEL_NAMES[row.level]}
            </span>
            <input
              value={row.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder={`${LEVEL_NAMES[row.level]} title`}
              className={cn(
                'w-full min-w-0 bg-transparent py-1 outline-none placeholder:text-muted-foreground/50 sm:w-0 sm:flex-1 pointer-coarse:py-2',
                row.level === 1 ? 'font-display text-[17px] font-medium' : 'text-sm font-medium pointer-coarse:text-base',
              )}
            />
          </div>
          {isHeading ? (
            // Entries with sub-entries are headings only; their sections carry the content
            <span className="ml-0.5 text-[12px] text-muted-foreground/60">Heading for the entries below</span>
          ) : (
            <input
              value={row.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="What it should cover (optional)"
              className="ml-0.5 w-full min-w-0 bg-transparent py-1 text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground/40 pointer-coarse:py-2 pointer-coarse:text-base"
            />
          )}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted sm:hidden"
              aria-label="Entry actions"
            >
              <Ellipsis className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={row.level === 1} onSelect={() => onChange({ level: (row.level - 1) as OutlineLevel })}>
              <ChevronLeft /> Move up a level
            </MenuItem>
            <MenuItem disabled={row.level === 3} onSelect={() => onChange({ level: (row.level + 1) as OutlineLevel })}>
              <ChevronRight /> Move down a level
            </MenuItem>
            <MenuItem danger onSelect={onRemove}>
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
        <div className="hidden shrink-0 items-center opacity-100 transition-opacity sm:flex pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 [&_button]:pointer-coarse:p-3">
          <Tooltip content="Move up a level">
            <button
              type="button"
              disabled={row.level === 1}
              onClick={() => onChange({ level: (row.level - 1) as OutlineLevel })}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Outdent"
            >
              <ChevronLeft className="size-4" />
            </button>
          </Tooltip>
          <Tooltip content="Move down a level">
            <button
              type="button"
              disabled={row.level === 3}
              onClick={() => onChange({ level: (row.level + 1) as OutlineLevel })}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Indent"
            >
              <ChevronRight className="size-4" />
            </button>
          </Tooltip>
          <Tooltip content="Remove">
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
              aria-label="Remove"
            >
              <Trash2 className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </motion.li>
  )
}

/** Review step: edit the drafted title and table of contents before anything is written. */
export function OutlineEditor({ book }: { book: Book }) {
  const [title, setTitle] = useState(book.title)
  const [rows, setRows] = useState<OutlineRow[]>(() => outlineToRows(book.outline))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const summary = useMemo(() => {
    try {
      const outline = rowsToOutline(rows)
      const chapters = Object.keys(outline).length
      const sections = rows.filter((r, i) => r.title.trim() && !(rows[i + 1] && rows[i + 1].level > r.level)).length
      return { ok: true as const, text: `${chapters} chapter${chapters === 1 ? '' : 's'} · ${sections} sections to write` }
    } catch (e) {
      return { ok: false as const, text: (e as Error).message }
    }
  }, [rows])

  const update = (id: string, patch: Partial<OutlineRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const add = (level: OutlineLevel) => setRows((rs) => [...rs, { id: newId(), level, title: '', description: '' }])

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((rs) =>
      arrayMove(
        rs,
        rs.findIndex((r) => r.id === active.id),
        rs.findIndex((r) => r.id === over.id),
      ),
    )
  }

  async function start() {
    try {
      const outline = rowsToOutline(rows)
      await updateBook(book.id, { title: title.trim() || book.title, outline, sections: {}, status: 'writing' })
      void writeBook(book.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function redraft() {
    await updateBook(book.id, { outline: null, status: 'drafting' })
    void draftOutline(book.id)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface overflow-hidden">
      <div className="border-b border-border bg-accent/30 px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-accent-foreground uppercase">Review the outline</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing is written yet. Rename, reorder (drag the handle), change levels, add or remove entries. Then start writing.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 sm:p-6">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Book title</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 font-display text-lg" />
        </label>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid grid-cols-1 gap-0.5">
              <AnimatePresence initial={false}>
                {rows.map((row, i) => (
                  <Row
                    key={row.id}
                    row={row}
                    index={i}
                    isHeading={Boolean(rows[i + 1] && rows[i + 1].level > row.level)}
                    onChange={(patch) => update(row.id, patch)}
                    onRemove={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => add(1)}>
            <Plus /> Chapter
          </Button>
          <Button variant="outline" size="sm" onClick={() => add(2)}>
            <Plus /> Section
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <p className={cn('text-sm', summary.ok ? 'text-muted-foreground' : 'text-danger')}>{summary.text}</p>
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <Button variant="ghost" onClick={() => void redraft()}>
            <RefreshCw /> Draft a new outline
          </Button>
          <Button variant="brand" disabled={!summary.ok} onClick={() => void start()}>
            <PenLine /> Start writing
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
