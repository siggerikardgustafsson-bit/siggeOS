// City resolution for the Upplevelser world map.
//
// Two tiers:
//  1. A small curated set (below) — Swedish/local spellings + famous small
//     spots + everyday cities. Synchronous, tiny, always available.
//  2. The full gazetteer (~24k cities, src/lib/cityData.js) — loaded on demand
//     via loadGazetteer() so the map paints immediately and fills in after.

// Curated: aliases the big list won't have (Swedish names), plus a fast path
// for the common cases. Keyed by normalised name → [lng, lat].
export const CURATED = {
  'stockholm': [18.07, 59.33], 'göteborg': [11.97, 57.71], 'gothenburg': [11.97, 57.71],
  'malmö': [13.0, 55.6], 'malmo': [13.0, 55.6], 'uppsala': [17.64, 59.86], 'kiruna': [20.22, 67.86],
  'täby': [18.06, 59.44], 'lund': [13.19, 55.7], 'visby': [18.29, 57.64], 'åre': [13.08, 63.4],
  'köpenhamn': [12.57, 55.68], 'oslo': [10.75, 59.91], 'bergen': [5.32, 60.39], 'tromsø': [18.96, 69.65],
  'helsingfors': [24.94, 60.17], 'reykjavik': [-21.94, 64.13], 'reykjavík': [-21.94, 64.13],
  'köpenhamm': [12.57, 55.68],
  'london': [-0.13, 51.51], 'paris': [2.35, 48.86], 'nice': [7.27, 43.7],
  'bryssel': [4.35, 50.85], 'brügge': [3.22, 51.21], 'bruges': [3.22, 51.21],
  'wien': [16.37, 48.21], 'münchen': [11.58, 48.14], 'köln': [6.96, 50.94], 'nürnberg': [11.08, 49.45],
  'zürich': [8.54, 47.37], 'genève': [6.14, 46.2], 'aten': [23.73, 37.98], 'athen': [23.73, 37.98],
  'lissabon': [-9.14, 38.72], 'rom': [12.5, 41.9], 'venedig': [12.34, 45.44], 'florens': [11.26, 43.77],
  'neapel': [14.27, 40.85], 'milano': [9.19, 45.46], 'turin': [7.69, 45.07],
  'warszawa': [21.01, 52.23], 'kraków': [19.94, 50.06], 'krakow': [19.94, 50.06],
  'prag': [14.42, 50.09], 'bukarest': [26.1, 44.43], 'belgrad': [20.46, 44.82],
  'moskva': [37.62, 55.75], 'sankt petersburg': [30.34, 59.93], 'kiev': [30.52, 50.45],
  'sarajevo': [18.41, 43.86], 'mostar': [17.81, 43.34], 'banja luka': [17.19, 44.77],
  'kotor': [18.77, 42.42], 'budva': [18.84, 42.29], 'ohrid': [20.8, 41.12],
  'skopje': [21.43, 41.99], 'pristina': [21.17, 42.66], 'priština': [21.17, 42.66],
  'istanbul': [28.98, 41.01], 'kappadokien': [34.83, 38.65], 'cappadocia': [34.83, 38.65],
  'ayia napa': [34.0, 34.99], 'santorini': [25.46, 36.39], 'mykonos': [25.33, 37.45],
  'kreta': [25.14, 35.34], 'rhodos': [28.22, 36.44],
  'dubai': [55.27, 25.2], 'abu dhabi': [54.37, 24.45], 'doha': [51.53, 25.29],
  'petra': [35.44, 30.33], 'jerusalem': [35.21, 31.77], 'tel aviv': [34.78, 32.08],
  'kairo': [31.24, 30.04], 'marrakech': [-7.98, 31.63], 'sharm el-sheikh': [34.33, 27.91],
  'kapstaden': [18.42, -33.92], 'zanzibar': [39.2, -6.16], 'kilimanjaro': [37.35, -3.07],
  'peking': [116.41, 39.9], 'hongkong': [114.17, 22.32], 'tokyo': [139.69, 35.69],
  'bangkok': [100.5, 13.76], 'phuket': [98.39, 7.89], 'bali': [115.19, -8.41],
  'ho chi minh city': [106.66, 10.82], 'saigon': [106.66, 10.82], 'hanoi': [105.83, 21.03],
  'new york': [-74.01, 40.71], 'los angeles': [-118.24, 34.05], 'san francisco': [-122.42, 37.77],
  'havanna': [-82.38, 23.11], 'cancún': [-86.85, 21.16], 'rio de janeiro': [-43.17, -22.91],
  'buenos aires': [-58.38, -34.6], 'cusco': [-71.97, -13.53], 'machu picchu': [-72.55, -13.16],
  'sydney': [151.21, -33.87], 'auckland': [174.76, -36.85], 'queenstown': [168.66, -45.03],
}

export const COUNTRY_CENTROIDS = {
  'Sverige': [16, 62], 'Norge': [9, 61], 'Danmark': [10, 56], 'Finland': [26, 64], 'Island': [-19, 65],
  'Spanien': [-3.7, 40], 'Portugal': [-8, 39.5], 'Frankrike': [2.3, 46.6], 'Italien': [12.5, 42.5],
  'Tyskland': [10.4, 51.1], 'Österrike': [14.5, 47.6], 'Schweiz': [8.2, 46.8], 'Belgien': [4.5, 50.6],
  'Nederländerna': [5.3, 52.1], 'Storbritannien': [-1.5, 52.5], 'Irland': [-8, 53.4],
  'Polen': [19.4, 52], 'Tjeckien': [15.5, 49.8], 'Slovakien': [19.5, 48.7], 'Ungern': [19.5, 47.2],
  'Rumänien': [25, 45.9], 'Bulgarien': [25.5, 42.7], 'Serbien': [20.9, 44], 'Kroatien': [16.4, 45.1],
  'Bosnien': [17.8, 44.2], 'Slovenien': [14.8, 46.1], 'Montenegro': [19.3, 42.8], 'Albanien': [20, 41],
  'Nordmakedonien': [21.7, 41.6], 'Kosovo': [21, 42.6], 'Grekland': [22, 39.1], 'Cypern': [33.2, 35.1],
  'Malta': [14.4, 35.9], 'Turkiet': [35.2, 39], 'Ukraina': [31, 49], 'Ryssland': [55, 62],
  'Georgien': [43.4, 42], 'Estland': [25.5, 58.6], 'Lettland': [24.9, 56.9], 'Litauen': [23.9, 55.2],
  'UAE': [54, 24], 'Saudiarabien': [45, 24], 'Israel': [35, 31.5], 'Jordanien': [36, 31],
  'Egypten': [30, 27], 'Marocko': [-6, 32], 'Tunisien': [9.5, 34],
  'USA': [-98, 39], 'Kanada': [-100, 56], 'Mexiko': [-102, 23], 'Kuba': [-79, 22], 'Costa Rica': [-84, 10],
  'Colombia': [-73, 4], 'Peru': [-75, -10], 'Argentina': [-64, -35], 'Brasilien': [-52, -10],
  'Japan': [138, 37], 'Kina': [104, 35], 'Sydkorea': [128, 36], 'Thailand': [101, 15], 'Vietnam': [106, 16],
  'Indonesien': [113, -1], 'Indien': [79, 22], 'Singapore': [103.8, 1.35], 'Malaysia': [102, 4],
  'Filippinerna': [122, 12], 'Australien': [134, -25], 'Nya Zeeland': [172, -42],
  'Sydafrika': [24, -29], 'Kenya': [38, 0], 'Etiopien': [39, 9], 'Tanzania': [35, -6],
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/\s+/g, ' ')

// Re-key CURATED through norm() so diacritic-stripped lookups ("kopenhamn")
// still hit entries written with the real spelling ("köpenhamn").
const CURATED_N = {}
for (const [k, v] of Object.entries(CURATED)) CURATED_N[norm(k)] = v

let gaz = null // Map<norm(name), { name, coord: [lng, lat] }>
let gazPromise = null

// Load the full ~24k-city gazetteer once (separate chunk).
export function loadGazetteer() {
  if (gaz) return Promise.resolve(gaz)
  if (!gazPromise) {
    gazPromise = import('./cityData.js').then(({ CITY_DATA }) => {
      const m = new Map()
      for (const line of CITY_DATA.split('\n')) {
        const i = line.lastIndexOf('|')
        const j = line.lastIndexOf('|', i - 1)
        if (j < 0) continue
        const name = line.slice(0, j)
        const lng = +line.slice(j + 1, i)
        const lat = +line.slice(i + 1)
        if (Number.isFinite(lng) && Number.isFinite(lat)) m.set(norm(name), { name, coord: [lng, lat] })
      }
      gaz = m
      return m
    }).catch(() => { gaz = new Map(); return gaz })
  }
  return gazPromise
}

export function gazetteerReady() {
  return !!gaz
}

const titleCase = (s) => String(s).replace(/\b\w/g, (m) => m.toUpperCase())

function lookupCity(k) {
  if (!k || k.length < 3) return null
  return CURATED_N[k] || gaz?.get(k)?.coord || null
}

// Typeahead for the trip city picker. Curated (Swedish spellings) first, then
// the gazetteer: prefix hits before substring hits, shorter names before longer.
// Needs loadGazetteer() to have resolved for anything beyond the curated set.
export function searchCities(query, limit = 8) {
  const q = norm(query)
  if (q.length < 2) return []
  const seen = new Set()
  const prefix = []
  const substr = []
  const add = (bucket, name, coord) => {
    const key = norm(name)
    if (seen.has(key)) return
    seen.add(key)
    bucket.push({ name, coord })
  }
  // Substring hits only count at a word start ("york" → "New York", not
  // "hvar" → "Molodohvardiysk").
  const wordHit = (n) => n.split(/[ \-']/).some((w) => w.startsWith(q))
  for (const [k, v] of Object.entries(CURATED_N)) {
    if (k === q || k.startsWith(q)) add(prefix, titleCase(k), v)
    else if (wordHit(k)) add(substr, titleCase(k), v)
  }
  if (gaz) {
    for (const { name, coord } of gaz.values()) {
      const n = norm(name)
      if (n.startsWith(q)) add(prefix, name, coord)
      else if (wordHit(n)) add(substr, name, coord)
      if (prefix.length > 40) break
    }
  }
  prefix.sort((a, b) => a.name.length - b.name.length)
  substr.sort((a, b) => a.name.length - b.name.length)
  return [...prefix, ...substr].slice(0, limit)
}

// Resolve a free-typed city name to { name, coord } (or null). Used when the
// user types a name and hits enter without picking a suggestion.
export function resolveCity(name) {
  const hits = searchCities(name, 1)
  if (hits.length && norm(hits[0].name) === norm(name)) return hits[0]
  const c = lookupCity(norm(name))
  return c ? { name: titleCase(norm(name)), coord: c } : (hits[0] || null)
}

// Stop-words so "Barcelona NYE" or "Prag skolresa" still match "barcelona"/"prag"
// but "med gänget" doesn't spuriously hit a town called "Med".
const STOP = new Set([
  'med', 'och', 'i', 'på', 'till', 'the', 'trip', 'resa', 'resan', 'roadtrip',
  'road', 'nye', 'nyår', 'skolresa', 'studentresa', 'cykling', 'de', 'la',
  'sur', 'del', 'san', 'st', 'stad', 'city', 'gänget', 'hela',
])

// Try every 1–3 word window of a phrase against the lookup; return all hits.
function phraseToCities(phrase) {
  const words = norm(phrase).replace(/[()[\]{}"'.]/g, ' ').split(/[\s,/›→>|+&–-]+/).filter(Boolean)
  const hits = []
  const used = new Set()
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.has(i)) continue
      const gram = words.slice(i, i + n).join(' ')
      if (n === 1 && (STOP.has(gram) || gram.length < 4)) continue
      const c = lookupCity(gram)
      if (c) {
        hits.push({ name: gram.replace(/\b\w/g, (m) => m.toUpperCase()), coord: c })
        for (let j = i; j < i + n; j++) used.add(j)
      }
    }
  }
  return hits
}

// Resolve a trip to one or more { name, coord, kind } points, in visit order.
// Priority: the explicit `cities` array (set in the trip form) → names parsed
// from the city field / title → the country centroid as a last resort.
export function tripToPoints(trip) {
  const out = []
  const seen = new Set()
  const push = (name, coord, kind) => {
    if (!coord || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) return
    const key = coord.map((n) => n.toFixed(1)).join(',')
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name: String(name).trim(), coord, kind })
  }

  // 1. Explicit, ordered list from the trip form — coords stored alongside.
  if (Array.isArray(trip.cities) && trip.cities.length) {
    for (const c of trip.cities) {
      if (c && Number.isFinite(c.lng) && Number.isFinite(c.lat)) push(c.name, [c.lng, c.lat], 'city')
      else if (c?.name) { const r = resolveCity(c.name); if (r) push(r.name, r.coord, 'city') }
    }
    if (out.length) return out
  }

  // 2. Best-effort parse of the free-text fields.
  for (const h of phraseToCities(trip.city || '')) push(h.name, h.coord, 'city')
  for (const h of phraseToCities(trip.title || '')) push(h.name, h.coord, 'city')

  // 3. Country centroid fallback.
  if (out.length === 0) {
    const countries = trip.countries?.length ? trip.countries : (trip.country ? [trip.country] : [])
    for (const c of countries) {
      const coord = COUNTRY_CENTROIDS[c]
      if (coord) push(c, coord, 'country')
    }
  }
  return out
}
