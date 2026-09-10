import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup, Sphere, Graticule } from 'react-simple-maps'
import worldTopo from 'world-atlas/countries-110m.json'
import { tripToPoints } from '../../lib/cityCoords'
import { TRIP_STATUS_COLOR } from '../../lib/constants'

// A projected world map (react-simple-maps + d3-geo). Trips are plotted as
// city markers — the emphasis is on *where you've been*, not blanket-shading
// countries. Lazy-loaded: keeps d3-geo + the topojson out of the route chunk.

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

export default function WorldMap({ trips = [], tripFilter = 'all' }) {
  const [hover, setHover] = useState(null)
  const [zoom, setZoom] = useState({ k: 1.35 })
  const bumpZoom = (f) => setZoom((s) => ({ k: Math.max(1, Math.min(14, s.k * f)) }))

  const { markers, visitedEN, cityCount, countryCount } = useMemo(() => {
    const filtered = tripFilter === 'all' ? trips : trips.filter(t => t.status === tripFilter)
    const byPoint = new Map()
    const visited = new Set()
    for (const t of filtered) {
      const st = t.status || 'idea'
      const cs = t.countries?.length ? t.countries : (t.country ? [t.country] : [])
      for (const c of cs) if (SV_EN[c]) visited.add(SV_EN[c])
      for (const p of tripToPoints(t)) {
        const key = p.coord.join(',')
        const cur = byPoint.get(key) || { name: p.name, coord: p.coord, kind: p.kind, trips: [], status: 'idea' }
        cur.trips.push(t)
        if (STATUS_RANK[st] > STATUS_RANK[cur.status]) cur.status = st
        byPoint.set(key, cur)
      }
    }
    // Hemland always counts as visited.
    if (tripFilter === 'all' || tripFilter === 'completed') visited.add('Sweden')
    const m = [...byPoint.values()].sort((a, b) => b.trips.length - a.trips.length)
    return {
      markers: m,
      visitedEN: visited,
      cityCount: m.filter(p => p.kind === 'city').length,
      countryCount: visited.size,
    }
  }, [trips, tripFilter])

  return (
    <div className="upp-map-panel">
      <div className="upp-map-stage" style={{ position: 'relative' }}>
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 175 }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup center={[22, 32]} zoom={zoom.k} minZoom={1} maxZoom={14}
            onMoveEnd={({ zoom: z }) => setZoom((s) => ({ ...s, k: z }))}>
            <Sphere id="upp-sphere" stroke="none" fill="color-mix(in srgb, #060912 68%, var(--surface))" />
            <Graticule stroke="var(--border2)" strokeWidth={0.3} strokeOpacity={0.3} />
            <Geographies geography={worldTopo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const isVisited = visitedEN.has(geo.properties.name)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: isVisited ? 'color-mix(in srgb, var(--accent) 22%, var(--surface3))' : 'var(--surface3)',
                          stroke: isVisited ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border2)',
                          strokeWidth: isVisited ? 0.5 : 0.35,
                          outline: 'none',
                        },
                        hover: { fill: 'color-mix(in srgb, var(--accent) 30%, var(--surface3))', outline: 'none' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>

            {markers.map((p) => {
              const c = STATUS_COLOR[p.status]
              const r = p.kind === 'country' ? 2.6 : 3.2 + Math.min(3.5, (p.trips.length - 1) * 1.2)
              const isHover = hover?.name === p.name
              return (
                <Marker key={p.name + p.coord.join()} coordinates={p.coord}
                  onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
                  <circle r={r + 4} fill={c} opacity={isHover ? 0.3 : 0.12}>
                    {p.status === 'completed' && (
                      <animate attributeName="opacity" values={`${isHover ? 0.3 : 0.12};0.02;${isHover ? 0.3 : 0.12}`} dur="3s" repeatCount="indefinite" />
                    )}
                  </circle>
                  <circle r={r} fill={c} stroke="var(--surface)" strokeWidth={1}
                    style={{ cursor: 'pointer', filter: isHover ? `drop-shadow(0 0 7px ${c})` : `drop-shadow(0 0 2px ${c})` }} />
                  {isHover && (
                    <text textAnchor="middle" y={-r - 5}
                      style={{ fontSize: 9, fontWeight: 800, fill: 'var(--text)', paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3, pointerEvents: 'none', textTransform: 'capitalize' }}>
                      {p.name}
                    </text>
                  )}
                </Marker>
              )
            })}
          </ZoomableGroup>
        </ComposableMap>

        <div className="upp-map-zoom">
          <button type="button" aria-label="Zooma in" onClick={() => bumpZoom(1.5)}>+</button>
          <button type="button" aria-label="Zooma ut" onClick={() => bumpZoom(1 / 1.5)}>−</button>
          {zoom.k > 1.5 && <button type="button" aria-label="Återställ" style={{ fontSize: 12 }} onClick={() => setZoom({ k: 1.35 })}>⟲</button>}
        </div>

        {hover && (
          <div style={{
            position: 'absolute', left: 12, bottom: 12, maxWidth: 240,
            background: 'var(--mx-panel-bg, var(--surface))', border: '1px solid var(--border)',
            borderRadius: 12, padding: '10px 12px', pointerEvents: 'none', boxShadow: '0 12px 30px -12px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{hover.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {hover.trips.slice(0, 4).map(t => t.title).join(' · ')}
              {hover.trips.length > 4 ? ` +${hover.trips.length - 4}` : ''}
            </div>
          </div>
        )}
      </div>

      <div className="upp-map-legend" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {['completed', 'planned', 'idea'].map(k => (
          <span key={k} className="upp-map-leg-item">
            <span className="upp-map-leg-dot" style={{ '--leg-c': STATUS_COLOR[k], background: STATUS_COLOR[k] }} />
            {STATUS_LABEL[k]}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {cityCount} städer · {countryCount} länder
        </span>
      </div>
    </div>
  )
}
