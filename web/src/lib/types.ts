/** A model on a provider: a built-in preset id (e.g. "openai") or a custom endpoint id. */
export interface ModelRef {
  providerId: string
  model: string
}

export type Step = 'outline' | 'title' | 'section'
export type SectionLength = 'short' | 'medium' | 'long'

export interface BookOptions {
  topic: string
  instructions: string
  style: string
  complexity: string
  seedContent: string
  longOutline: boolean
  sectionLength: SectionLength
}

/** Nested table of contents: a title maps to a description (a section) or to sub-entries. */
export interface Outline {
  [title: string]: string | Outline
}

export type BookStatus =
  | 'drafting' // writing the outline and title
  | 'review' // waiting for the user to approve the outline
  | 'writing'
  | 'paused'
  | 'complete'

export interface SectionState {
  text: string
  updatedAt: number
  /** The model that wrote it. */
  model?: ModelRef
}

export interface Stats {
  inputTokens: number
  outputTokens: number
  modelSeconds: number
}

export interface ApiError {
  code: string
  title: string
  message: string
  hint: string
  /** The provider's full error, when `message` is only the readable part of it. */
  detail?: string
}

export interface Book {
  id: string
  title: string
  status: BookStatus
  options: BookOptions
  models: Record<Step, ModelRef>
  reviewOutline: boolean
  /** Stop after each chapter, so it can be read (and rewritten) before the next is written. */
  chapterByChapter: boolean
  outline: Outline | null
  /** Finished sections only, keyed by sectionKey(path). */
  sections: Record<string, SectionState>
  stats: Stats
  error: ApiError | null
  createdAt: number
  updatedAt: number
}

/** A flattened outline entry. */
export interface OutlineNode {
  key: string
  path: string[]
  title: string
  description: string
  depth: number
  isSection: boolean
}

// ---- Server (/api/config) -----------------------------------------------------------------

/** How a provider describes a model: its strongest, a good middle, or fast and low-cost. */
export type ModelTier = 'best' | 'balanced' | 'fast'

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
  key_url: string
  default_model: string
  models: string[]
  tiers: Record<string, ModelTier>
  requires_key: boolean
  local: boolean
}

export interface ServerConfig {
  version: string
  providers: ProviderPreset[]
  allow_custom_endpoints: boolean
  allow_private_endpoints: boolean
  section_lengths: Record<SectionLength, number>
  max_seed_chars: number
}
