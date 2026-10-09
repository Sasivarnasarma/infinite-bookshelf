/**
 * Rewrites: one-click instructions for the note, recently typed notes, and the version a rewrite
 * replaced (kept so the rewrite can be undone).
 */
import type { SectionState } from './types'

export interface RewritePreset {
  id: string
  label: string
  /** What the model is asked to do. */
  instruction: string
}

export const REWRITE_PRESETS: RewritePreset[] = [
  { id: 'shorter', label: 'Shorter', instruction: 'Make it noticeably shorter, keeping the key points.' },
  { id: 'longer', label: 'Longer', instruction: 'Make it longer, going deeper into each point.' },
  { id: 'simpler', label: 'Simpler', instruction: 'Explain it more simply, for a reader new to the topic, defining any jargon.' },
  { id: 'technical', label: 'More technical', instruction: 'Make it more technical and precise, for an experienced reader.' },
  { id: 'example', label: 'Add an example', instruction: 'Add a concrete, worked example.' },
  { id: 'code', label: 'Add code', instruction: 'Add a short, correct code example where it helps.' },
  { id: 'fix', label: 'Fix mistakes', instruction: 'Check the facts, commands and code, and fix anything wrong or out of date.' },
  { id: 'engaging', label: 'More engaging', instruction: 'Make it more engaging to read, with a livelier opening and smoother flow.' },
]

/** The note sent with a rewrite: the chosen presets' instructions, then the reader's own words. */
export function rewriteNote(presetIds: string[], text: string): string {
  const instructions = REWRITE_PRESETS.filter((p) => presetIds.includes(p.id)).map((p) => p.instruction)
  return [...instructions, text.trim()].filter(Boolean).join(' ')
}

export const MAX_RECENT_NOTES = 5

/** Recently typed notes, newest first, without repeats. */
export function rememberNote(recent: string[], note: string): string[] {
  const text = note.trim()
  if (!text) return recent
  return [text, ...recent.filter((n) => n !== text)].slice(0, MAX_RECENT_NOTES)
}

/**
 * The section after a rewrite: the new version, keeping the one it replaced so the rewrite can
 * be undone. Only one step back is kept.
 */
export function withPrevious(next: SectionState, replaced: SectionState | undefined): SectionState {
  if (!replaced) return next
  const { previous: _older, ...kept } = replaced // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...next, previous: kept }
}

/** The section with its last rewrite undone, or null if there's nothing to undo. */
export function undone(section: SectionState | undefined): SectionState | null {
  return section?.previous ? { ...section.previous, updatedAt: Date.now() } : null
}
