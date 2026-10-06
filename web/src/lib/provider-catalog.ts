/**
 * How the "Add provider" gallery describes each built-in provider. Purely presentational: the
 * providers themselves (address, models) come from the server's /api/config.
 */

export type ProviderTag = 'popular' | 'free' | 'fast' | 'open' | 'local'

export const TAG_LABELS: Record<ProviderTag, string> = {
  popular: 'Popular',
  free: 'Free tier',
  fast: 'Fast',
  open: 'Open models',
  local: 'On your computer',
}

export const CATALOG: Record<string, { blurb: string; tags: ProviderTag[] }> = {
  openai: { blurb: 'GPT models from the makers of ChatGPT.', tags: ['popular'] },
  anthropic: { blurb: 'Claude: thoughtful, long-form writing.', tags: ['popular'] },
  gemini: { blurb: "Google's Gemini, with a generous free tier.", tags: ['popular', 'free', 'fast'] },
  xai: { blurb: 'Grok models from xAI.', tags: ['popular'] },
  openrouter: { blurb: 'One key for hundreds of models.', tags: ['popular', 'open'] },
  deepseek: { blurb: 'Strong models at a low price.', tags: ['open'] },
  mistral: { blurb: 'European models from Mistral AI.', tags: ['open'] },
  groq: { blurb: 'Very fast open models, with a free tier.', tags: ['fast', 'free', 'open'] },
  moonshot: { blurb: 'Kimi: long context and long-form work.', tags: ['open'] },
  qwen: { blurb: "Alibaba's Qwen models.", tags: ['open'] },
  zai: { blurb: 'GLM models from Z.ai.', tags: ['open'] },
  together: { blurb: 'Popular open models in one place.', tags: ['open', 'fast'] },
  fireworks: { blurb: 'Fast hosting for open models.', tags: ['open', 'fast'] },
  cerebras: { blurb: 'Extremely fast inference, with a free tier.', tags: ['fast', 'free', 'open'] },
  ollama: { blurb: 'Run models on your own computer.', tags: ['local', 'open', 'free'] },
  lmstudio: { blurb: 'Local models from the LM Studio app.', tags: ['local', 'open', 'free'] },
}

/** Shown to people with no provider yet: a free start, and one key for everything. */
export const STARTERS = ['gemini', 'openrouter']
