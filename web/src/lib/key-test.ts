/**
 * Testing API keys: lists the provider's models with the key, records the result as the key's
 * health, and keeps the model list for suggestions.
 */
import { ApiRequestError, listModels, listModelsWithSecret } from './api'
import { useKeyHealth } from './key-health'
import { useProviders } from './settings'
import type { ApiError } from './types'

export type TestOutcome = { ok: true; models: string[] } | { ok: false; error: ApiError }

function toError(e: unknown): ApiError {
  if (e instanceof ApiRequestError) return e.error
  return { code: 'unknown', title: 'Connection failed', message: e instanceof Error ? e.message : String(e), hint: '' }
}

/** Tests a saved key and records the result. */
export async function testKey(serviceId: string, keyId: string): Promise<TestOutcome> {
  const health = useKeyHealth.getState()
  try {
    const models = await listModels(serviceId, keyId)
    health.report(keyId, { state: 'ok', message: 'Working', models: models.length })
    useProviders.getState().updateService(serviceId, { fetchedModels: models })
    return { ok: true, models }
  } catch (e) {
    const error = toError(e)
    if (error.code === 'rate_limit') health.report(keyId, { state: 'limited', message: error.title, until: Date.now() + 60_000 })
    else health.report(keyId, { state: 'failed', message: error.title })
    return { ok: false, error }
  }
}

/** Tests a key that isn't saved yet. */
export async function testSecret(serviceId: string, secret: string): Promise<TestOutcome> {
  try {
    return { ok: true, models: await listModelsWithSecret(serviceId, secret) }
  } catch (e) {
    return { ok: false, error: toError(e) }
  }
}
