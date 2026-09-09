import React, { useState, useRef } from 'react'
import { WORLD_PATHS, COUNTRY_PATHS } from '../../lib/worldPaths'
import { TRIP_STATUS_COLOR, TRIP_STATUS_RANK } from '../../lib/constants'

// Lazy-loaded on purpose: worldPaths.js is ~1.6MB of SVG geometry. Keeping it
// (and the map UI that needs it) out of the Upplevelser route chunk drops that
// chunk from ~1.7MB to ~50KB. See project_build_verification memory.

const COUNTRY_COORDS = {
  'Sverige':[15,62],'Norge':[8,61],'Danmark':[10,56],'Finland':[26,64],'Island':[-19,65],
  'Spanien':[-4,40],'Portugal':[-8,39.5],'Frankrike':[2,47],'Italien':[12,42],'Tyskland':[10,51],
  'Österrike':[14,47.5],'Schweiz':[8,47],'Belgien':[4,50.5],'Nederländerna':[5,52],
  'Luxemburg':[6,49.6],'Storbritannien':[-2,54],'Irland':[-8,53],
  'Polen':[19,52],'Tjeckien':[15,50],'Slovakien':[19,48.7],'Ungern':[19,47],'Rumänien':[25,46],
  'Bulgarien':[25,42.7],'Serbien':[21,44],'Kroatien':[15.5,45.1],'Bosnien':[18,44],
  'Slovenien':[14.8,46],'Montenegro':[19.3,42.7],'Albanien':[20,41],'Nordmakedonien':[21.7,41.6],
  'Kosovo':[21,42.6],'Moldavien':[28.4,47],'Ukraina':[31,49],'Belarus':[28,53.7],
  'Estland':[26,59],'Lettland':[25,57],'Litauen':[24,55],
  'Turkiet':[35,39],'Grekland':[22,39],'Cypern':[33,35],'Malta':[14.4,35.9],
  'Ryssland':[90,62],'Georgien':[43.4,42],'Armenien':[45,40],'Azerbajdzjan':[47.5,40.4],
  'UAE':[54,24],'Saudiarabien':[45,24],'Israel':[35,31.5],'Jordanien':[36,31],
  'Libanon':[35.8,33.9],'Egypten':[30,27],'Marocko':[-6,32],'Tunisien':[9,34],
  'USA':[-98,39],'Kanada':[-106,56],'Mexiko':[-102,23],'Kuba':[-79,22],
  'Costa Rica':[-84,10],'Colombia':[-74,4],'Peru':[-75,-10],'Argentina':[-64,-38],'Brasilien':[-52,-10],
  'Japan':[138,36],'Kina':[105,35],'Sydkorea':[128,36],'Thailand':[101,15],'Vietnam':[106,16],
  'Indonesien':[113,-1],'Indien':[79,22],'Singapore':[104,1.3],'Malaysia':[102,4],'Filippinerna':[122,12],
  'Australien':[134,-25],'Nya Zeeland':[174,-41],
  'Sydafrika':[25,-29],'Kenya':[38,0],'Etiopien':[40,9],'Tanzania':[35,-6],
}

const STATUS_RANK = TRIP_STATUS_RANK
// Map view deliberately uses the theme accent for completed trips.
const STATUS_MAP_COLOR = { completed: 'var(--accent)', planned: TRIP_STATUS_COLOR.planned, idea: TRIP_STATUS_COLOR.idea }

// Världen full-bredd är 360 men datan är mest på norra halvklotet/Europa.
// Beskär bort Antarktis och tomma poler för bättre fyllnad.
const MAP_VIEW = { x: 0, y: 18, w: 360, h: 134 }

function buildCountryStatus(trips, tripFilter) {
  const filtered = tripFilter === 'all' ? trips : trips.filter(t => t.status === tripFilter)
  const countryStatus = {}
  for (const t of filtered) {
    const cs = t.countries?.length ? t.countries : (t.country ? [t.country] : [])
    for (const c of cs) {
      if (!COUNTRY_COORDS[c] && !COUNTRY_PATHS[c]) continue
      if (!countryStatus[c] || STATUS_RANK[t.status] > STATUS_RANK[countryStatus[c]]) countryStatus[c] = t.status
    }
  }
  // Sverige (hemland) räknas alltid som besökt
  if (tripFilter === 'all' || tripFilter === 'completed') {
    if (!countryStatus['Sverige'] || STATUS_RANK['completed'] > STATUS_RANK[countryStatus['Sverige']]) {
      countryStatus['Sverige'] = 'completed'
    }
  }
  return countryStatus
}

export default function WorldMap({ trips = [], tripFilter = 'all' }) {
  const countryStatus = buildCountryStatus(trips, tripFilter)
  const proj = ([lon, lat]) => [lon + 180, 90 - lat]
  const [view, setView] = useState(MAP_VIEW)
  const svgRef = useRef(null)
  const drag = useRef(null)

  function clampZoom(w) {
    return Math.max(MAP_VIEW.w * 0.12, Math.min(MAP_VIEW.w, w))
  }

  function zoomAt(factor, cx, cy) {
    setView(v => {
      let nw = clampZoom(v.w * factor)
      const ratio = v.h / v.w
      let nh = nw * ratio
      const px = (cx - v.x) / v.w
      const py = (cy - v.y) / v.h
      let nx = cx - px * nw
      let ny = cy - py * nh
      nx = Math.max(MAP_VIEW.x - nw * 0.15, Math.min(MAP_VIEW.x + MAP_VIEW.w - nw * 0.85, nx))
      ny = Math.max(MAP_VIEW.y - nh * 0.15, Math.min(MAP_VIEW.y + MAP_VIEW.h - nh * 0.85, ny))
      return { x: nx, y: ny, w: nw, h: nh }
    })
  }

  function toSvg(e) {
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    return [view.x + px * view.w, view.y + py * view.h]
  }

  function onWheel(e) {
    e.preventDefault()
    const [cx, cy] = toSvg(e)
    zoomAt(e.deltaY > 0 ? 1.12 : 0.89, cx, cy)
  }

  function onPointerDown(e) {
    drag.current = { x: e.clientX, y: e.clientY, view }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    if (!drag.current) return
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const dx = (e.clientX - drag.current.x) / rect.width * drag.current.view.w
    const dy = (e.clientY - drag.current.y) / rect.height * drag.current.view.h
    const v = drag.current.view
    let nx = v.x - dx, ny = v.y - dy
    nx = Math.max(MAP_VIEW.x - v.w * 0.15, Math.min(MAP_VIEW.x + MAP_VIEW.w - v.w * 0.85, nx))
    ny = Math.max(MAP_VIEW.y - v.h * 0.15, Math.min(MAP_VIEW.y + MAP_VIEW.h - v.h * 0.85, ny))
    setView({ x: nx, y: ny, w: v.w, h: v.h })
  }
  function onPointerUp(e) {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  function btnZoom(factor) {
    zoomAt(factor, view.x + view.w / 2, view.y + view.h / 2)
  }

  const zoomed = view.w < MAP_VIEW.w - 0.5

  return (
    <div className="upp-map-panel">
      <div className="upp-map-stage">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="upp-map-svg"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <defs>
            <linearGradient id="upp-grad-completed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 92%, white)" />
              <stop offset="55%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 72%, black)" />
            </linearGradient>
            <linearGradient id="upp-grad-planned" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, #3b82f6 40%, transparent)" />
              <stop offset="100%" stopColor="color-mix(in srgb, #3b82f6 14%, transparent)" />
            </linearGradient>
            <linearGradient id="upp-grad-idea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, #8b5cf6 40%, transparent)" />
              <stop offset="100%" stopColor="color-mix(in srgb, #8b5cf6 14%, transparent)" />
            </linearGradient>
          </defs>
          {/* Bas: kontinenter utan synliga landsgränser */}
          <g className="upp-world-geo">
            {WORLD_PATHS.map((d, i) => (
              <path key={i} d={d} fill="rgba(255,255,255,0.05)" stroke="none" />
            ))}
          </g>
          {/* Markerade länder med riktig geometri */}
          {Object.entries(countryStatus).map(([name, st]) => {
            const d = COUNTRY_PATHS[name]
            const color = STATUS_MAP_COLOR[st]
            if (!d) {
              const coord = COUNTRY_COORDS[name]
              if (!coord) return null
              const [x, y] = proj(coord)
              return <circle key={name} cx={x} cy={y} r="2.4" fill={color} className={`upp-fill upp-fill-${st}`} />
            }
            return (
              <path key={name} d={d} className={`upp-fill upp-fill-${st}`}
                fill={`url(#upp-grad-${st})`}
                stroke={color} strokeWidth={st === 'completed' ? 0.4 : 0.9}
                strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                <title>{name}</title>
              </path>
            )
          })}
        </svg>
        <div className="upp-map-zoom">
          <button type="button" aria-label="Zooma in" onClick={() => btnZoom(0.7)}>+</button>
          <button type="button" aria-label="Zooma ut" onClick={() => btnZoom(1.42)}>−</button>
          {zoomed && <button type="button" aria-label="Återställ" onClick={() => setView(MAP_VIEW)} style={{ fontSize: 11 }}>⟲</button>}
        </div>
      </div>
      <div className="upp-map-legend">
        {[['completed', 'Avklarad'], ['planned', 'Planerad'], ['idea', 'Idé']].map(([k, label]) => (
          <span key={k} className="upp-map-leg-item">
            <span className={`upp-map-leg-dot upp-map-leg-${k}`} style={{ '--leg-c': STATUS_MAP_COLOR[k] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
