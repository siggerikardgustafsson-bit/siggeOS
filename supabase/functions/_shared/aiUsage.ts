// ============================================================================
// Claude API usage accounting (post_deploy_25 → public.ai_usage).
// ----------------------------------------------------------------------------
// Sum the four billed meters across a request's tool-loop iterations and log
// one row, so cost per feature is measured instead of guessed. cost_usd is an
// ESTIMATE from list prices ($/MTok, snapshot 2026-09-25 — the Console bill is
// the truth; update PRICES when models or prices change):
//   cache write = 1.25x input (5 min TTL) or 2x input (1 h TTL)
//   cache read  = per-model rate below
// ============================================================================

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.30 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.20 },
  'claude-opus-5-5':   { input: 4, output: 20, cacheRead: 0.20 },
  'claude-haiku-4-5':  { input: 1, output: 5,  cacheRead: 0.10 },
}

export type UsageAcc = {
  iterations: number
  input: number
  write5m: number
  write1h: number
  read: number
  output: number
}

export const newUsage = (): UsageAcc => ({ iterations: 0, input: 0, write5m: 0, write1h: 0, read: 0, output: 0 })

// Accepts a Messages API `usage` object (full response, or the pieces from
// streaming message_start / message_delta events). Counts one iteration per
// object that carries input_tokens (message_start / non-stream response).
export function addUsage(acc: UsageAcc, u: any) {
  if (!u) return
  if (u.input_tokens != null) acc.iterations++
  acc.input += Number(u.input_tokens) || 0
  acc.read += Number(u.cache_read_input_tokens) || 0
  acc.output += Number(u.output_tokens) || 0
  const split = u.cache_creation
  if (split && (split.ephemeral_5m_input_tokens != null || split.ephemeral_1h_input_tokens != null)) {
    acc.write5m += Number(split.ephemeral_5m_input_tokens) || 0
    acc.write1h += Number(split.ephemeral_1h_input_tokens) || 0
  } else {
    acc.write5m += Number(u.cache_creation_input_tokens) || 0
  }
}

export function costUsd(model: string, a: UsageAcc): number {
  const p = PRICES[model] || PRICES['claude-sonnet-4-6']
  const m = 1e6
  return (a.input * p.input + a.write5m * p.input * 1.25 + a.write1h * p.input * 2 + a.read * p.cacheRead + a.output * p.output) / m
}

// Best-effort — a logging failure must never break the AI call itself.
export async function logUsage(client: any, userId: string, feature: string, model: string, a: UsageAcc) {
  if (!a.iterations) return
  try {
    const { error } = await client.from('ai_usage').insert({
      user_id: userId, feature: feature.slice(0, 60), model, iterations: a.iterations,
      input_tokens: a.input, cache_write_tokens: a.write5m + a.write1h, cache_read_tokens: a.read,
      output_tokens: a.output, cost_usd: Math.round(costUsd(model, a) * 1e5) / 1e5,
    })
    if (error) console.warn('ai_usage insert failed:', error.message)
  } catch (e) {
    console.warn('ai_usage insert threw:', e instanceof Error ? e.message : String(e))
  }
}
