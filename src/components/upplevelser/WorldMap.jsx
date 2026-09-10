import { useState, useMemo, useEffect } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup, Sphere, Graticule } from 'react-simple-maps'
// 50m Natural Earth borders — emitted as a standalone cached asset (≈236KB gz),
// fetched by <Geographies> instead of inflating this JS chunk.
import worldTopo from 'world-atlas/countries-50m.json?url'
import { tripToPoints, loadGazetteer } from '../../lib/cityCoords'
import { TRIP_STATUS_COLOR } from '../../lib/constants'

// Projected world map (react-simple-maps + d3-geo). The emphasis is on *cities* —
// where you've actually been — with faint country shading behind. Lazy-loaded
// chunk (keeps d3-geo, the 50m topojson and the gazetteer out of the route bundle).

const STATUS_COLOR = {
  completed: 'var(--accent)',
  planned: TRIP_STATUS_COLOR.planned || '#3b82f6',
  idea: TRIP_STATUS_COLOR.idea || '#8b5cf6',
}
const STATUS_RANK = { idea: 0, planned: 1, completed: 2 }
const STATUS_LABEL = { completed: 'Avklarad', planned: 'Planerad', idea: 'Idé' }

// Swedish → English country names for the light "visited" fill on land.
const SV_EN = {
  'Sverige': 'Sweden', 'Norge': 'Norway', 'Danmark': 'Denmark', 'Finland': 'Finland', 'Island': 'Iceland',
  'Spanien': 'Spain', 'Portugal': 'Portugal', 'Frankrike': 'France', 'Italien': 'Italy', 'Tyskland': 'Germany',
  'Österrike': 'Austria', 'Schweiz': 'Switzerland', 'Belgien': 'Belgium', 'Nederländerna': 'Netherlands',
  'Storbritannien': 'United Kingdom', 'Irland': 'Ireland', 'Polen': 'Poland', 'Tjeckien': 'Czechia',
  'Slovakien': 'Slovakia', 'Ungern': 'Hungary', 'Rumänien': 'Romania', 'Bulgarien': 'Bulgaria',
  'Serbien': 'Serbia', 'Kroatien': 'Croatia', 'Bosnien': 'Bosnia and Herz.', 'Slovenien': 'Slovenia',
  'Montenegro': 'Montenegro', 'Albanien': 'Albania', 'Nordmakedonien': 'North Macedonia', 'Kosovo': 'Kosovo',
  'Grekland': 'Greece', 'Cypern': 'Cyprus', 'Turkiet': 'Turkey', 'Ukraina': 'Ukraine', 'Ryssland': 'Russia',
  'Georgien': 'Georgia', 'Estland': 'Estonia', 'Lettland': 'Latvia', 'Litauen': 'Lithuania',
  'UAE': 'United Arab Emirates', 'Saudiarabien': 'Saudi Arabia', 'Israel': 'Israel', 'Jordanien': 'Jordan',
  'Egypten': 'Egypt', 'Marocko': 'Morocco', 'Tunisien': 'Tunisia', 'USA': 'United States of America',
  'Kanada': 'Canada', 'Mexiko': 'Mexico', 'Kuba': 'Cuba', 'Costa Rica': 'Costa Rica', 'Colombia': 'Colombia',
  'Peru': 'Peru', 'Argentina': 'Argentina', 'Brasilien': 'Brazil', 'Japan': 'Japan', 'Kina': 'China',
  'Sydkorea': 'South Korea', 'Thailand': 'Thailand', 'Vietnam': 'Vietnam', 'Indonesien': 'Indonesia',
  'Indien': 'India', 'Singapore': 'Singapore', 'Malaysia': 'Malaysia', 'Filippinerna': 'Philippines',
  'Australien': 'Australia', 'Nya Zeeland': 'New Zealand', 'Sydafrika': 'South Africa', 'Kenya': 'Kenya',
  'Etiopien': 'Ethiopia', 'Tanzania': 'Tanzania',
}

const DEFAULT_VIEW = { coordinates: [24, 22], zoom: 1.35 }

export default function WorldMap({ trips = [], tripFilter = 'all', highlightTripId = null, onFixCities }) {
  const [hover, setHover] = useState(null)
  const [view, setView] = useState(DEFAULT_VIEW)
  const [gazReady, setGazReady] = useState(false)

  // The gazetteer streams in as its own chunk; re-resolve once it lands.
  useEffect(() => { loadGazetteer().then(() => setGazReady(true)) }, [])

  const { markers, visitedEN, cityCount, noCity, firstNoCityId } = useMemo(() => {
    const filtered = tripFilter === 'all' ? trips : trips.filter(t => t.status === tripFilter)
    const byPoint = new Map()
    const visited = new Map()          // EN name -> best status (completed > planned > idea)
    const bumpVisited = (en, st) => {
      const cur = visited.get(en)
      if (!cur || STATUS_RANK[st] > STATUS_RANK[cur]) visited.set(en, st)
    }
    let noCity = 0
    let firstNoCityId = null
    for (const t of filtered) {
      const st = t.status || 'idea'
      const cs = t.countries?.length ? t.countries : (t.country ? [t.country] : [])
      for (const c of cs) if (SV_EN[c]) bumpVisited(SV_EN[c], st)
      const pts = tripToPoints(t)
      for (const p of pts) {
        const key = p.coord.join(',')
        const cur = byPoint.get(key) || { name: p.name, coord: p.coord, kind: p.kind, trips: [], status: 'idea' }
        cur.trips.push(t)
        if (STATUS_RANK[st] > STATUS_RANK[cur.status]) cur.status = st
        byPoint.set(key, cur)
      }
      const cityPts = pts.filter(p => p.kind === 'city')
      if (cs.length && cityPts.length === 0) { noCity++; if (!firstNoCityId) firstNoCityId = t.id }
    }
    if (tripFilter === 'all' || tripFilter === 'completed') bumpVisited('Sweden', 'completed')
    const m = [...byPoint.values()].sort((a, b) => b.trips.length - a.trips.length)
    return {
      markers: m,
      visitedEN: visited,
      cityCount: m.filter(p => p.kind === 'city').length,
      noCity,
      firstNoCityId,
    }
  }, [trips, tripFilter, gazReady])

  const k = view.zoom            // markers/labels counter-scale so they stay a constant screen size
  const zoomed = view.zoom >= 2.2
  const bump = (f) => setView(v => ({ ...v, zoom: Math.max(1, Math.min(16, v.zoom * f)) }))
  const reset = () => setView(DEFAULT_VIEW)

  return (
    <div className="upp-map-panel">
      <div className="upp-map-stage">
        <ComposableMap width={1000} height={500} projection="geoEqualEarth"
          projectionConfig={{ scale: 182, center: [0, 0] }} style={{ width: '100%', height: '100%' }}>
          <ZoomableGroup center={view.coordinates} zoom={view.zoom} minZoom={1} maxZoom={16}
            onMoveEnd={({ coordinates, zoom }) => setView({ coordinates, zoom })}>
            <Sphere id="upp-sphere" stroke="none" fill="var(--upp-ocean)" />
            <Graticule stroke="var(--upp-grat)" strokeWidth={0.28} />
            <Geographies geography={worldTopo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const vs = visitedEN.get(geo.properties.name)
                  const fill = vs === 'completed' ? 'var(--upp-land-done)'
                    : vs ? 'var(--upp-land-plan)' : 'var(--upp-land)'
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: { fill, stroke: 'var(--upp-border)', strokeWidth: 0.3, outline: 'none' },
                        hover: { fill, outline: 'none' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>

            {markers.map((p) => {
              const c = STATUS_COLOR[p.status]
              const isCity = p.kind === 'city'
              const r = (isCity ? 3.4 + Math.min(3.4, (p.trips.length - 1) * 1.1) : 2.4) / k
              const isHover = hover?.name === p.name
              const onTrip = highlightTripId && p.trips.some(t => t.id === highlightTripId)
              const hot = isHover || onTrip
              const showLabel = hot || (zoomed && isCity)
              return (
                <Marker key={p.name + p.coord.join()} coordinates={p.coord}
                  onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
                  {p.status === 'completed' && hot && (
                    <circle r={r} fill="none" stroke={c} strokeWidth={1 / k} opacity={0.6}>
                      <animate attributeName="r" values={`${r};${r + 9 / k}`} dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {p.status === 'completed'
                    ? <circle r={r} fill={c} stroke="var(--upp-dot-ring)" strokeWidth={1 / k}
                        style={{ cursor: 'pointer', filter: `drop-shadow(0 0 ${(hot ? 6 : 2.5) / k}px ${c})` }} />
                    : <circle r={r} fill="var(--upp-ocean)" stroke={c} strokeWidth={1.6 / k}
                        style={{ cursor: 'pointer', filter: hot ? `drop-shadow(0 0 ${5 / k}px ${c})` : 'none' }} />}
                  {showLabel && (
                    <text textAnchor="middle" y={-r - 4 / k}
                      style={{ fontSize: 9 / k, fontWeight: 700, fill: 'var(--upp-label)', paintOrder: 'stroke',
                        stroke: 'var(--upp-ocean)', strokeWidth: 3 / k, pointerEvents: 'none', textTransform: 'capitalize' }}>
                      {p.name}
                    </text>
                  )}
                </Marker>
              )
            })}
          </ZoomableGroup>
        </ComposableMap>

        <div className="upp-map-zoom">
          <button type="button" aria-label="Zooma in" onClick={() => bump(1.5)}>+</button>
          <button type="button" aria-label="Zooma ut" onClick={() => bump(1 / 1.5)}>−</button>
          {(view.zoom > 1.6 || view.coordinates[0] !== DEFAULT_VIEW.coordinates[0]) && (
            <button type="button" aria-label="Återställ vy" style={{ fontSize: 13 }} onClick={reset}>⌂</button>
          )}
        </div>

        {hover && (
          <div className="upp-map-tip">
            <div className="upp-map-tip-name">{hover.name}</div>
            <div className="upp-map-tip-sub">
              {hover.kind === 'country' && <span style={{ opacity: 0.7 }}>ungefärlig · </span>}
              {hover.trips.slice(0, 4).map(t => t.title).join(' · ')}
              {hover.trips.length > 4 ? ` +${hover.trips.length - 4}` : ''}
            </div>
          </div>
        )}
      </div>

      <div className="upp-map-legend">
        {['completed', 'planned', 'idea'].map(k => (
          <span key={k} className="upp-map-leg-item">
            <span className="upp-map-leg-dot" style={{ '--leg-c': STATUS_COLOR[k], background: k === 'completed' ? STATUS_COLOR[k] : 'transparent', borderColor: STATUS_COLOR[k] }} />
            {STATUS_LABEL[k]}
          </span>
        ))}
        {noCity > 0 && onFixCities && (
          <button type="button" className="upp-map-nudge" onClick={() => onFixCities(firstNoCityId)}>
            {noCity} {noCity === 1 ? 'resa' : 'resor'} utan stad — fyll i
          </button>
        )}
        <span className="upp-map-leg-count">{cityCount} {cityCount === 1 ? 'stad' : 'städer'} på kartan</span>
      </div>
    </div>
  )
}
