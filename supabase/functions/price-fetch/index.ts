// supabase/functions/price-fetch/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple in-memory cache (lives for the duration of the function instance)
const cache: Record<string, { price: number; currency: string; ts: number }> = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function fetchYahoo(ticker: string): Promise<{ price: number | null; currency: string }> {
  const cached = cache[ticker]
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { price: cached.price, currency: cached.currency }
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
    const currency = data?.chart?.result?.[0]?.meta?.currency ?? 'USD'
    if (price) cache[ticker] = { price, currency, ts: Date.now() }
    return { price, currency }
  } catch {
    return { price: null, currency: 'USD' }
  }
}

async function fetchCrypto(ids: string[]): Promise<Record<string, number>> {
  const cacheKey = ids.join(',')
  const cached = cache[cacheKey]
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return JSON.parse(String(cached.price))
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=sek`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    const result: Record<string, number> = {}
    for (const id of ids) {
      if (data[id]?.sek) result[id] = data[id].sek
    }
    cache[cacheKey] = { price: JSON.stringify(result) as any, currency: 'SEK', ts: Date.now() }
    return result
  } catch {
    return {}
  }
}

const CRYPTO_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum',
  'bitcoin': 'bitcoin', 'ethereum': 'ethereum',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { assets } = await req.json()
    if (!Array.isArray(assets)) throw new Error('assets must be array')

    const stocks = assets.filter((a: any) => a.type === 'stock' || a.type === 'fund')
    const cryptos = assets.filter((a: any) => a.type === 'crypto')

    // Fetch USD/SEK first
    const { price: usdSek } = await fetchYahoo('USDSEK=X')
    const fxRate = usdSek || 10.5

    // Fetch all stocks/funds in parallel
    const stockResults = await Promise.all(
      stocks.map(async (asset: any) => {
        if (!asset.ticker) return { id: asset.id, price: null }
        const { price, currency } = await fetchYahoo(asset.ticker)
        if (!price) return { id: asset.id, price: null }
        const priceSek = currency === 'SEK' ? price : price * fxRate
        return { id: asset.id, price: priceSek, source: 'yahoo' }
      })
    )

    // Fetch all crypto in one request
    let cryptoResults: { id: string; price: number | null; source: string }[] = []
    if (cryptos.length > 0) {
      const geckoIds = cryptos.map((a: any) => CRYPTO_IDS[a.ticker] || a.ticker.toLowerCase())
      const prices = await fetchCrypto(geckoIds)
      cryptoResults = cryptos.map((asset: any) => {
        const geckoId = CRYPTO_IDS[asset.ticker] || asset.ticker.toLowerCase()
        return { id: asset.id, price: prices[geckoId] || null, source: 'coingecko' }
      })
    }

    const results: Record<string, any> = {}
    for (const r of [...stockResults, ...cryptoResults]) {
      if (r.price) results[r.id] = { price: r.price, source: r.source }
    }

    return new Response(JSON.stringify({ prices: results, usdSek: fxRate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
