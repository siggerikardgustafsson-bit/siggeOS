// City gazetteer for the Upplevelser world map — [lng, lat].
// Curated: dense in Europe + the Balkans (where most trips are), plus world
// capitals and major cities. Names are matched case-insensitively, with a few
// Swedish spellings aliased. Falls back to country centroids (countryCoords).

export const CITY_COORDS = {
  // ── Nordics ──
  'stockholm': [18.07, 59.33], 'göteborg': [11.97, 57.71], 'gothenburg': [11.97, 57.71],
  'malmö': [13.0, 55.6], 'malmo': [13.0, 55.6], 'uppsala': [17.64, 59.86], 'kiruna': [20.22, 67.86],
  'täby': [18.06, 59.44], 'lund': [13.19, 55.7], 'visby': [18.29, 57.64], 'åre': [13.08, 63.4],
  'köpenhamn': [12.57, 55.68], 'copenhagen': [12.57, 55.68], 'oslo': [10.75, 59.91],
  'bergen': [5.32, 60.39], 'tromsø': [18.96, 69.65], 'helsingfors': [24.94, 60.17], 'helsinki': [24.94, 60.17],
  'reykjavik': [-21.94, 64.13], 'reykjavík': [-21.94, 64.13],
  // ── Western Europe ──
  'london': [-0.13, 51.51], 'manchester': [-2.24, 53.48], 'edinburgh': [-3.19, 55.95],
  'dublin': [-6.26, 53.35], 'paris': [2.35, 48.86], 'nice': [7.27, 43.7], 'lyon': [4.83, 45.76],
  'marseille': [5.37, 43.3], 'bordeaux': [-0.58, 44.84], 'amsterdam': [4.9, 52.37],
  'rotterdam': [4.48, 51.92], 'bryssel': [4.35, 50.85], 'brussels': [4.35, 50.85],
  'brügge': [3.22, 51.21], 'bruges': [3.22, 51.21], 'antwerpen': [4.4, 51.22],
  'luxemburg': [6.13, 49.61], 'berlin': [13.4, 52.52], 'münchen': [11.58, 48.14], 'munich': [11.58, 48.14],
  'hamburg': [9.99, 53.55], 'frankfurt': [8.68, 50.11], 'köln': [6.96, 50.94], 'cologne': [6.96, 50.94],
  'wien': [16.37, 48.21], 'vienna': [16.37, 48.21], 'salzburg': [13.05, 47.81], 'innsbruck': [11.4, 47.27],
  'zürich': [8.54, 47.37], 'zurich': [8.54, 47.37], 'genève': [6.14, 46.2], 'geneva': [6.14, 46.2],
  'bern': [7.45, 46.95], 'interlaken': [7.85, 46.69],
  // ── Southern Europe ──
  'madrid': [-3.7, 40.42], 'barcelona': [2.17, 41.39], 'sevilla': [-5.98, 37.39], 'seville': [-5.98, 37.39],
  'valencia': [-0.38, 39.47], 'málaga': [-4.42, 36.72], 'malaga': [-4.42, 36.72], 'palma': [2.65, 39.57],
  'ibiza': [1.43, 38.91], 'lissabon': [-9.14, 38.72], 'lisbon': [-9.14, 38.72], 'porto': [-8.61, 41.15],
  'rom': [12.5, 41.9], 'rome': [12.5, 41.9], 'milano': [9.19, 45.46], 'milan': [9.19, 45.46],
  'venedig': [12.34, 45.44], 'venice': [12.34, 45.44], 'florens': [11.26, 43.77], 'florence': [11.26, 43.77],
  'neapel': [14.27, 40.85], 'naples': [14.27, 40.85], 'palermo': [13.36, 38.12], 'aten': [23.73, 37.98],
  'athen': [23.73, 37.98], 'athens': [23.73, 37.98], 'thessaloniki': [22.94, 40.64], 'santorini': [25.46, 36.39],
  'mykonos': [25.33, 37.45], 'kreta': [25.14, 35.34], 'valletta': [14.51, 35.9], 'malta': [14.43, 35.9],
  'nicosia': [33.36, 35.17], 'ayia napa': [34.0, 34.99], 'larnaca': [33.62, 34.92],
  // ── Central & Eastern Europe ──
  'warszawa': [21.01, 52.23], 'warsaw': [21.01, 52.23], 'kraków': [19.94, 50.06], 'krakow': [19.94, 50.06],
  'gdansk': [18.65, 54.35], 'prag': [14.42, 50.09], 'prague': [14.42, 50.09], 'brno': [16.61, 49.2],
  'bratislava': [17.11, 48.15], 'budapest': [19.04, 47.5], 'wroclaw': [17.04, 51.11],
  'bukarest': [26.1, 44.43], 'bucharest': [26.1, 44.43], 'sofia': [23.32, 42.7], 'plovdiv': [24.75, 42.14],
  'tallinn': [24.75, 59.44], 'riga': [24.11, 56.95], 'vilnius': [25.28, 54.69],
  'kiev': [30.52, 50.45], 'kyiv': [30.52, 50.45], 'lviv': [24.03, 49.84], 'minsk': [27.57, 53.9],
  'moskva': [37.62, 55.75], 'moscow': [37.62, 55.75], 'sankt petersburg': [30.34, 59.93],
  // ── Balkans ──
  'belgrad': [20.46, 44.82], 'belgrade': [20.46, 44.82], 'novi sad': [19.83, 45.25],
  'zagreb': [15.98, 45.81], 'split': [16.44, 43.51], 'dubrovnik': [18.09, 42.65], 'zadar': [15.23, 44.12],
  'ljubljana': [14.51, 46.06], 'sarajevo': [18.41, 43.86], 'mostar': [17.81, 43.34],
  'banja luka': [17.19, 44.77], 'podgorica': [19.26, 42.44], 'kotor': [18.77, 42.42],
  'budva': [18.84, 42.29], 'tirana': [19.82, 41.33], 'skopje': [21.43, 41.99], 'ohrid': [20.8, 41.12],
  'pristina': [21.17, 42.66], 'priština': [21.17, 42.66],
  // ── Turkey, Caucasus, Middle East ──
  'istanbul': [28.98, 41.01], 'ankara': [32.85, 39.93], 'izmir': [27.14, 38.42], 'antalya': [30.71, 36.9],
  'kappadokien': [34.83, 38.65], 'cappadocia': [34.83, 38.65], 'tbilisi': [44.8, 41.72],
  'batumi': [41.64, 41.64], 'jerevan': [44.51, 40.18], 'baku': [49.87, 40.41],
  'dubai': [55.27, 25.2], 'abu dhabi': [54.37, 24.45], 'doha': [51.53, 25.29], 'riyadh': [46.72, 24.71],
  'jeddah': [39.2, 21.54], 'tel aviv': [34.78, 32.08], 'jerusalem': [35.21, 31.77], 'amman': [35.93, 31.95],
  'petra': [35.44, 30.33], 'beirut': [35.5, 33.89],
  // ── Africa ──
  'kairo': [31.24, 30.04], 'cairo': [31.24, 30.04], 'marrakech': [-7.98, 31.63], 'casablanca': [-7.62, 33.57],
  'tunis': [10.18, 36.81], 'kapstaden': [18.42, -33.92], 'cape town': [18.42, -33.92],
  'nairobi': [36.82, -1.29], 'zanzibar': [39.2, -6.16], 'addis abeba': [38.75, 9.03],
  // ── Asia ──
  'tokyo': [139.69, 35.69], 'kyoto': [135.77, 35.01], 'osaka': [135.5, 34.69], 'peking': [116.41, 39.9],
  'beijing': [116.41, 39.9], 'shanghai': [121.47, 31.23], 'hongkong': [114.17, 22.32], 'hong kong': [114.17, 22.32],
  'seoul': [126.98, 37.57], 'bangkok': [100.5, 13.76], 'phuket': [98.39, 7.89], 'chiang mai': [98.98, 18.79],
  'hanoi': [105.83, 21.03], 'ho chi minh city': [106.66, 10.82], 'singapore': [103.82, 1.35],
  'kuala lumpur': [101.69, 3.14], 'bali': [115.19, -8.41], 'jakarta': [106.85, -6.21],
  'delhi': [77.21, 28.61], 'mumbai': [72.88, 19.08], 'manila': [120.98, 14.6], 'colombo': [79.86, 6.93],
  // ── Americas ──
  'new york': [-74.01, 40.71], 'los angeles': [-118.24, 34.05], 'san francisco': [-122.42, 37.77],
  'chicago': [-87.63, 41.88], 'miami': [-80.19, 25.76], 'las vegas': [-115.14, 36.17],
  'washington': [-77.04, 38.91], 'boston': [-71.06, 42.36], 'toronto': [-79.38, 43.65],
  'vancouver': [-123.12, 49.28], 'montreal': [-73.57, 45.5], 'mexico city': [-99.13, 19.43],
  'cancún': [-86.85, 21.16], 'havanna': [-82.38, 23.11], 'havana': [-82.38, 23.11],
  'san josé': [-84.09, 9.93], 'bogotá': [-74.07, 4.71], 'lima': [-77.03, -12.05],
  'cusco': [-71.97, -13.53], 'buenos aires': [-58.38, -34.6], 'rio de janeiro': [-43.17, -22.91],
  'são paulo': [-46.63, -23.55],
  // ── Oceania ──
  'sydney': [151.21, -33.87], 'melbourne': [144.96, -37.81], 'auckland': [174.76, -36.85],
  'queenstown': [168.66, -45.03],
}

// Rough country centroids for a fallback pin when the city is unknown.
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

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Resolve a trip to one or more { name, coord, kind } points. Prefers an
// explicit city, then any known city names in the title, then the country.
export function tripToPoints(trip) {
  const out = []
  const seen = new Set()
  const push = (name, coord, kind) => {
    const k = coord.join(',')
    if (seen.has(k)) return
    seen.add(k)
    out.push({ name, coord, kind })
  }

  const cityFields = []
  if (trip.city) cityFields.push(...String(trip.city).split(/[,/›→>|]+/))
  // Scan the title for known city names (handles "Sarajevo → Abu Dhabi → Dubai")
  const title = norm(trip.title)
  for (const key of Object.keys(CITY_COORDS)) {
    if (title.includes(key)) cityFields.push(key)
  }
  for (const raw of cityFields) {
    const c = CITY_COORDS[norm(raw)]
    if (c) push(raw.trim(), c, 'city')
  }

  if (out.length === 0) {
    const countries = trip.countries?.length ? trip.countries : (trip.country ? [trip.country] : [])
    for (const c of countries) {
      const coord = COUNTRY_CENTROIDS[c]
      if (coord) push(c, coord, 'country')
    }
  }
  return out
}
