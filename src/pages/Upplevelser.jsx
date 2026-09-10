import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, Check, ChevronDown, ChevronUp,
  Compass, Flame, SkipForward, Edit2, FileText, Sparkles, Trash2
} from 'lucide-react'
import { TRIP_STATUSES } from '../lib/constants'
import EmptyState from '../components/EmptyState'
import { getUserIdentityContext, identityToPrompt } from '../lib/personalization'
import { loadGazetteer, searchCities, resolveCity } from '../lib/cityCoords'

// Heavy (1.6MB of SVG geometry) — split into its own chunk, loaded when the
// Resor tab renders. See project_build_verification.
const WorldMap = lazy(() => import('../components/upplevelser/WorldMap'))

const COUNTRIES = [
  'Sverige','Norge','Danmark','Finland','Island',
  'Spanien','Portugal','Frankrike','Italien','Tyskland','Österrike','Schweiz',
  'Belgien','Nederländerna','Luxemburg','Storbritannien','Irland',
  'Polen','Tjeckien','Slovakien','Ungern','Rumänien','Bulgarien',
  'Serbien','Kroatien','Bosnien','Slovenien','Montenegro','Albanien',
  'Nordmakedonien','Kosovo','Moldavien','Ukraina','Belarus',
  'Estland','Lettland','Litauen',
  'Turkiet','Grekland','Cypern','Malta',
  'Ryssland','Georgien','Armenien','Azerbajdzjan',
  'UAE','Saudiarabien','Israel','Jordanien','Libanon','Egypten','Marocko','Tunisien',
  'USA','Kanada','Mexiko','Kuba','Costa Rica','Colombia','Peru','Argentina','Brasilien',
  'Japan','Kina','Sydkorea','Thailand','Vietnam','Indonesien','Indien','Singapore','Malaysia','Filippinerna',
  'Australien','Nya Zeeland',
  'Sydafrika','Kenya','Etiopien','Tanzania',
]
const FLAGS = {
  'Sverige':'🇸🇪','Norge':'🇳🇴','Danmark':'🇩🇰','Finland':'🇫🇮','Island':'🇮🇸',
  'Spanien':'🇪🇸','Portugal':'🇵🇹','Frankrike':'🇫🇷','Italien':'🇮🇹','Tyskland':'🇩🇪',
  'Österrike':'🇦🇹','Schweiz':'🇨🇭','Belgien':'🇧🇪','Nederländerna':'🇳🇱',
  'Luxemburg':'🇱🇺','Storbritannien':'🇬🇧','Irland':'🇮🇪',
  'Polen':'🇵🇱','Tjeckien':'🇨🇿','Slovakien':'🇸🇰','Ungern':'🇭🇺','Rumänien':'🇷🇴',
  'Bulgarien':'🇧🇬','Serbien':'🇷🇸','Kroatien':'🇭🇷','Bosnien':'🇧🇦',
  'Slovenien':'🇸🇮','Montenegro':'🇲🇪','Albanien':'🇦🇱','Nordmakedonien':'🇲🇰',
  'Kosovo':'🇽🇰','Moldavien':'🇲🇩','Ukraina':'🇺🇦','Belarus':'🇧🇾',
  'Estland':'🇪🇪','Lettland':'🇱🇻','Litauen':'🇱🇹',
  'Turkiet':'🇹🇷','Grekland':'🇬🇷','Cypern':'🇨🇾','Malta':'🇲🇹',
  'Ryssland':'🇷🇺','Georgien':'🇬🇪','Armenien':'🇦🇲','Azerbajdzjan':'🇦🇿',
  'UAE':'🇦🇪','Saudiarabien':'🇸🇦','Israel':'🇮🇱','Jordanien':'🇯🇴',
  'Libanon':'🇱🇧','Egypten':'🇪🇬','Marocko':'🇲🇦','Tunisien':'🇹🇳',
  'USA':'🇺🇸','Kanada':'🇨🇦','Mexiko':'🇲🇽','Kuba':'🇨🇺',
  'Costa Rica':'🇨🇷','Colombia':'🇨🇴','Peru':'🇵🇪','Argentina':'🇦🇷','Brasilien':'🇧🇷',
  'Japan':'🇯🇵','Kina':'🇨🇳','Sydkorea':'🇰🇷','Thailand':'🇹🇭','Vietnam':'🇻🇳',
  'Indonesien':'🇮🇩','Indien':'🇮🇳','Singapore':'🇸🇬','Malaysia':'🇲🇾','Filippinerna':'🇵🇭',
  'Australien':'🇦🇺','Nya Zeeland':'🇳🇿',
  'Sydafrika':'🇿🇦','Kenya':'🇰🇪','Etiopien':'🇪🇹','Tanzania':'🇹🇿',
}

const ADVENTURE_CATEGORIES = ['mat', 'musik', 'natur', 'spontant', 'socialt', 'kultur', 'övrigt']
// TRIP_STATUSES now imported from ../lib/constants (shared with Ekonomi + Jarvis).
const DIFFICULTIES = [
  { id: 'lätt',  label: 'Lätt',  color: '#10b981' },
  { id: 'medel', label: 'Medel', color: '#f59e0b' },
  { id: 'galen', label: 'Galen', color: '#ef4444' },
]

const EMPTY_TRIP = {
  title: '', country: '', countries: [], city: '', cities: [], start_date: '', end_date: '',
  highlights: '', rating: 0, status: 'completed', budget_sek: '', notes: ''
}

function StarRating({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1,2,3,4,5].map(i => (
        <button key={i} onClick={() => onChange(i)} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
          color: i <= value ? '#f59e0b' : 'var(--muted)', fontSize: '18px',
        }}>★</button>
      ))}
    </div>
  )
}

function CountryPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = React.useRef(null)
  const searchRef = React.useRef(null)

  const toggle = (c) => {
    if (selected.includes(c)) onChange(selected.filter(x => x !== c))
    else onChange([...selected, c])
  }

  const filtered = search.trim()
    ? COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : COUNTRIES

  function handleOpen() {
    setOpen(o => !o)
    setSearch('')
  }

  React.useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (triggerRef.current && !triggerRef.current.closest('[data-country-picker]')?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div data-country-picker="true" style={{ position: 'relative' }} ref={triggerRef}>
      <button type="button" onClick={handleOpen} style={{
        width: '100%', padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--border)', background: 'var(--surface)',
        color: selected.length ? 'var(--text)' : 'var(--muted)',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
        fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? 'Välj länder...' :
           selected.map(c => (FLAGS[c] || '🌍') + ' ' + c).join(', ')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selected.length > 0 && (
            <span style={{
              fontSize: '11px', background: '#3b82f6', color: 'white',
              borderRadius: '10px', padding: '1px 7px', fontWeight: 600,
            }}>{selected.length}</span>
          )}
          <ChevronDown size={14} color="rgba(148,163,184,0.8)" />
        </div>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          marginTop: 6, borderRadius: 12, overflow: 'hidden',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={searchRef}
              placeholder="Sök land..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: '13px',
                fontFamily: 'Inter, sans-serif', outline: 'none',
              }}
            />
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={{
              padding: '8px 10px', display: 'flex', gap: 5, flexWrap: 'wrap',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(59,130,246,0.06)',
            }}>
              {selected.map(c => (
                <button key={c} onClick={() => toggle(c)} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 20,
                  border: '1px solid rgba(59,130,246,0.4)',
                  background: 'rgba(59,130,246,0.15)', color: '#93c5fd',
                  fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  {FLAGS[c] || '🌍'} {c} <X size={10} />
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>Inga resultat</div>
              : filtered.map(c => (
                <button key={c} onClick={() => toggle(c)} style={{
                  width: '100%', padding: '9px 14px', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
                  fontSize: '13px', display: 'flex', alignItems: 'center', gap: 10,
                  color: selected.includes(c) ? 'var(--text)' : 'var(--muted)',
                  background: selected.includes(c) ? 'rgba(59,130,246,0.14)' : 'transparent',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={e => { if (!selected.includes(c)) e.currentTarget.style.background = 'var(--surface-hover, rgba(127,127,127,0.12))' }}
                onMouseLeave={e => { if (!selected.includes(c)) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{FLAGS[c] || '🌍'}</span>
                  <span style={{ flex: 1 }}>{c}</span>
                  {selected.includes(c) && <Check size={13} color="#60a5fa" />}
                </button>
              ))
            }
          </div>

          {/* Footer */}
          <div style={{
            borderTop: '1px solid var(--border)', padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--surface)',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {filtered.length} länder
            </span>
            <button onClick={() => { setOpen(false); setSearch('') }} style={{
              background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.35)',
              borderRadius: 6, padding: '5px 16px', color: '#93c5fd',
              fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600,
            }}>Klar</button>
          </div>
        </div>
      )}
    </div>
  )
}


// Ordered multi-city picker with typeahead against the 24k-city gazetteer.
// Stores [{ name, lng, lat }] so the map never has to re-geocode.
function CityPicker({ value = [], onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [ready, setReady] = useState(false)
  const [focused, setFocused] = useState(false)
  const boxRef = React.useRef(null)

  useEffect(() => { loadGazetteer().then(() => setReady(true)) }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim()
      if (term.length < 2) { setResults([]); return }
      const chosen = new Set(value.map(c => c.name.toLowerCase()))
      setResults(searchCities(term, 7).filter(r => !chosen.has(r.name.toLowerCase())))
    }, 140)
    return () => clearTimeout(t)
  }, [q, value, ready])

  useEffect(() => {
    if (!focused) return
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocused(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [focused])

  const addCity = (c) => {
    if (!c) return
    if (value.some(v => v.name.toLowerCase() === c.name.toLowerCase())) { setQ(''); return }
    onChange([...value, { name: c.name, lng: c.coord[0], lat: c.coord[1] }])
    setQ('')
    setResults([])
  }
  const removeCity = (i) => onChange(value.filter((_, idx) => idx !== i))
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const term = q.trim()
      if (!term) return
      // Resolve synchronously — don't depend on the debounced `results`.
      const hit = results[0] || searchCities(term, 1)[0] || resolveCity(term)
      if (hit) addCity(hit)
    } else if (e.key === 'Backspace' && !q && value.length) {
      removeCity(value.length - 1)
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div className="input" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', minHeight: '38px', padding: '5px 8px', cursor: 'text' }}
        onClick={() => boxRef.current?.querySelector('input')?.focus()}>
        {value.map((c, i) => (
          <span key={c.name + i} className="upp-city-chip">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Tidigare" style={{ opacity: i === 0 ? 0.25 : 0.7 }}>‹</button>
            <span>{c.name}</span>
            <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} title="Senare" style={{ opacity: i === value.length - 1 ? 0.25 : 0.7 }}>›</button>
            <button type="button" onClick={() => removeCity(i)} title="Ta bort" style={{ marginLeft: '1px' }}><X size={11} /></button>
          </span>
        ))}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? 'Lägg till stad…' : 'Sök stad — t.ex. Sarajevo, Hanoi…'}
          style={{ flex: 1, minWidth: '120px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '13px', fontFamily: 'Inter, sans-serif', padding: '4px 2px' }}
        />
      </div>
      {focused && q.trim().length >= 2 && (
        <div className="upp-city-menu">
          {!ready && <div className="upp-city-opt" style={{ color: 'var(--muted)' }}>Laddar städer…</div>}
          {ready && results.length === 0 && <div className="upp-city-opt" style={{ color: 'var(--muted)' }}>Ingen träff — tryck Enter för att lägga till ändå</div>}
          {results.map(r => (
            <button type="button" key={r.name + r.coord.join()} className="upp-city-opt" onClick={() => addCity(r)}>
              <span>📍 {r.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{r.coord[1].toFixed(1)}, {r.coord[0].toFixed(1)}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>
        Städer i ordning — driver kartan. Pilarna ‹ › ändrar reserutten.
      </div>
    </div>
  )
}

const BUDGET_CATEGORIES = [
  { id: 'flyg', label: 'Flyg / Transport', icon: '✈️' },
  { id: 'boende', label: 'Boende', icon: '🏨' },
  { id: 'mat', label: 'Mat & leverne', icon: '🍽️' },
  { id: 'utrustning', label: 'Utrustning', icon: '🎒' },
  { id: 'ovrigt', label: 'Övrigt', icon: '💡' },
]

const EMPTY_BUDGET_ITEM = { category: 'flyg', description: '', amount: '', isEstimate: false }

function TripPlannerModal({ trip, onClose, onSave }) {
  const [planningDoc, setPlanningDoc] = React.useState(trip.planning_doc || trip.notes || '')
  const [cities, setCities] = React.useState(Array.isArray(trip.cities) ? trip.cities : [])
  const [budgetItems, setBudgetItems] = React.useState(
    trip.budget_items?.length ? trip.budget_items : BUDGET_CATEGORIES.map(c => ({ ...EMPTY_BUDGET_ITEM, category: c.id, description: '', amount: '', isEstimate: false }))
  )
  const [jarvisLoading, setJarvisLoading] = React.useState(false)
  const [jarvisComment, setJarvisComment] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const totalBudget = budgetItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
  const hasEstimates = budgetItems.some(i => i.isEstimate)

  function updateItem(idx, field, value) {
    setBudgetItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value, isEstimate: field === 'amount' ? false : item.isEstimate } : item))
  }

  function addItem() {
    setBudgetItems(prev => [...prev, { ...EMPTY_BUDGET_ITEM }])
  }

  function removeItem(idx) {
    setBudgetItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function askJarvis() {
    setJarvisLoading(true)
    setJarvisComment('')
    try {
      const tripCountries = trip.countries?.length ? trip.countries.join(', ') : trip.country || 'okänt'
      const days = trip.start_date && trip.end_date
        ? Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) + 1
        : null

      const budgetSummary = budgetItems.map(item => {
        const cat = BUDGET_CATEGORIES.find(c => c.id === item.category)?.label || item.category
        const hasAmount = item.amount && parseFloat(item.amount) > 0
        return `${cat}: ${item.description || 'ingen info'} → ${hasAmount ? item.amount + ' kr' : 'SAKNAS (estimera)'}`
      }).join('\n')

      const prompt = `Du är Jarvis, användarens personliga AI-assistent. Analysera denna reseplan och estimera budget.

RESA: ${trip.title}
LÄNDER: ${tripCountries}
DATUM: ${trip.start_date || '?'} → ${trip.end_date || '?'}${days ? ` (${days} dagar)` : ''}

PLANERINGSDOKUMENT:
${planningDoc || 'Inget skrivet ännu'}

NUVARANDE BUDGETPOSTER:
${budgetSummary}

Uppgift:
1. För varje budgetpost som saknar belopp: estimera ett realistiskt belopp i SEK baserat på destination, antal dagar och eventuella länkar/beskrivningar
2. Om en post har en länk (t.ex. till flyg eller boende), försök tolka priset från länken/kontexten
3. Ge en kort kommentar om totalbudgeten och om något verkar dyrt/billigt

Svara ENBART med JSON (inga backticks):
{
  "items": [
    {"category": "flyg", "description": "...", "amount": 1200, "isEstimate": true, "note": "..."},
    ...
  ],
  "totalComment": "...",
  "tips": "..."
}`

      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: prompt }],
          context: '',
          systemPrompt: 'Du är Jarvis, användarens AI-assistent. Svara bara med JSON utan backticks.',
        },
      })

      if (data?.content) {
        const cleaned = data.content.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (parsed.items?.length) {
          setBudgetItems(parsed.items.map(item => ({
            category: item.category || 'ovrigt',
            description: item.description || '',
            amount: String(item.amount || ''),
            isEstimate: !!item.isEstimate,
            note: item.note || '',
          })))
        }
        if (parsed.totalComment || parsed.tips) {
          setJarvisComment([parsed.totalComment, parsed.tips].filter(Boolean).join(' '))
        }
      }
    } catch (err) {
      console.error('Jarvis budget error:', err)
      setJarvisComment('Något gick fel. Försök igen.')
    }
    setJarvisLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      ...trip,
      cities,
      planning_doc: planningDoc,
      budget_items: budgetItems,
      budget_sek: totalBudget > 0 ? Math.round(totalBudget) : trip.budget_sek,
      notes: planningDoc,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--glass-shadow)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: '700', marginBottom: '3px' }}>
              {trip.countries?.slice(0,3).map(c => FLAGS[c] || '').join('') || '🗺️'} {trip.title}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Reseplanering & budget
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Cities / route */}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '8px' }}>
              STÄDER & RUTT
            </div>
            <CityPicker value={cities} onChange={setCities} />
          </div>

          {/* Planning doc */}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '8px' }}>
              PLANERINGSDOKUMENT
            </div>
            <textarea
              value={planningDoc}
              onChange={e => setPlanningDoc(e.target.value)}
              placeholder={"Skriv din plan här... Klistra in flyglinks, boende, aktiviteter, tankar.\n\nEx:\n✈️ Flyg: https://www.ryanair.com/... (1 200 kr)\n🏨 Boende: Hostel i Sarajevo, 3 nätter\n🍽️ Mat: ~250 kr/dag\n📋 Aktiviteter: Gamla stan, Mostar dagtrip..."}
              rows={8}
              className="input"
              style={{ resize: 'vertical', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.6' }}
            />
          </div>

          {/* Budget */}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>BUDGET</span>
              {totalBudget > 0 && (
                <span style={{ color: 'var(--text)', fontWeight: '600', fontSize: '13px' }}>
                  Totalt: {Math.round(totalBudget).toLocaleString('sv-SE')} kr
                  {hasEstimates && <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: '6px' }}>(inkl. estimat)</span>}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              {budgetItems.map((item, idx) => {
                const cat = BUDGET_CATEGORIES.find(c => c.id === item.category)
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '8px', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <select
                      value={item.category}
                      onChange={e => updateItem(idx, 'category', e.target.value)}
                      className="input"
                      style={{ padding: '6px 8px', fontSize: '12px', width: 'auto' }}
                    >
                      {BUDGET_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                    </select>
                    <input
                      className="input"
                      placeholder="Länk eller beskrivning..."
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <input
                        className="input"
                        type="number"
                        placeholder="kr"
                        value={item.amount}
                        onChange={e => updateItem(idx, 'amount', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '12px', width: '90px', color: item.isEstimate ? '#f59e0b' : 'var(--text)' }}
                      />
                      {item.isEstimate && <span style={{ fontSize: '10px', color: '#f59e0b', whiteSpace: 'nowrap' }}>est.</span>}
                    </div>
                    <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.5, padding: '2px' }}>
                      <Trash2 size={13} />
                    </button>
                    {item.note && (
                      <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginTop: '2px' }}>
                        💡 {item.note}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button onClick={addItem} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '8px', cursor: 'pointer', fontSize: '12px', width: '100%', fontFamily: 'Inter, sans-serif' }}>
              + Lägg till post
            </button>

            {/* Jarvis budget */}
            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '12px' }}>
              <button
                onClick={askJarvis}
                disabled={jarvisLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', color: '#a78bfa', padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: '600', width: '100%', justifyContent: 'center' }}
              >
                {jarvisLoading
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Jarvis analyserar...</>
                  : <><Sparkles size={14} /> Låt Jarvis estimera budget</>
                }
              </button>
              {jarvisComment && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--muted2)', lineHeight: '1.6' }}>
                  💬 {jarvisComment}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-ghost">Avbryt</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TripForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ fontWeight: '600' }}>{initial.id ? 'Redigera resa' : 'Lägg till resa'}</div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Titel</label>
          <input className="input" placeholder="t.ex. Lissabon" value={form.title} onChange={e => f('title', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Status</label>
          <select className="input" value={form.status} onChange={e => f('status', e.target.value)}>
            {TRIP_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Länder</label>
          <CountryPicker selected={form.countries || []} onChange={v => f('countries', v)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Städer</label>
          <CityPicker value={form.cities || []} onChange={v => f('cities', v)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Budget (kr)</label>
          <input className="input" type="number" placeholder="t.ex. 8000" value={form.budget_sek} onChange={e => f('budget_sek', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Startdatum</label>
          <input className="input" type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum</label>
          <input className="input" type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Betyg</label>
          <StarRating value={form.rating} onChange={v => f('rating', v)} />
        </div>
        {form.status === 'completed' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Highlights</label>
            <textarea className="input" rows={2} placeholder="Vad var bäst?" value={form.highlights} onChange={e => f('highlights', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="btn btn-ghost">Avbryt</button>
        <button onClick={() => onSave(form)} className="btn btn-primary" disabled={saving || !form.title}>
          {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
        </button>
      </div>
    </div>
  )
}

// Savings progress toward a trip's budget: "23 400 / 42 000 kr", a bar, and a
// pace hint ("lägg 2 700 kr/mån för att hinna till avresa").
function TripSavings({ trip, onSave }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(trip.saved_sek ?? '')
  React.useEffect(() => { setDraft(trip.saved_sek ?? '') }, [trip.saved_sek])

  const budget = Number(trip.budget_sek) || 0
  const saved = Number(trip.saved_sek) || 0
  const pct = budget > 0 ? Math.max(0, Math.min(1, saved / budget)) : 0
  const remaining = Math.max(0, budget - saved)

  let pace = null
  if (remaining > 0 && trip.start_date) {
    const months = (new Date(trip.start_date) - new Date()) / (30.44 * 86400000)
    if (months >= 0.5) pace = `Lägg ${Math.ceil(remaining / months / 100) * 100} kr/mån för att hinna (${Math.round(months)} mån kvar).`
    else if (months >= 0) pace = `${remaining.toLocaleString('sv-SE')} kr kvar och mindre än en månad till avresa.`
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>SPARAT</span>
        {editing ? (
          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input className="input" type="number" value={draft} autoFocus onChange={e => setDraft(e.target.value)}
              style={{ width: '90px', fontSize: '12px', padding: '3px 6px' }} />
            <button onClick={() => { onSave(draft); setEditing(false) }} className="btn btn-primary" style={{ fontSize: '11px', padding: '3px 8px' }}>OK</button>
          </span>
        ) : (
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', fontWeight: '600', padding: 0 }}>
            {saved.toLocaleString('sv-SE')} / {budget.toLocaleString('sv-SE')} kr
            <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>{Math.round(pct * 100)}%</span>
          </button>
        )}
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
      {pace && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>{pace}</div>}
    </div>
  )
}

export default function UpplevelserPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('resor')
  const [trips, setTrips] = useState([])
  const [adventures, setAdventures] = useState([])
  const [sideQuests, setSideQuests] = useState([])
  const [expandedTrip, setExpandedTrip] = useState(null)
  const [saving, setSaving] = useState(false)
  const [generatingQuests, setGeneratingQuests] = useState(false)
  const [showNewTrip, setShowNewTrip] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [showNewAdventure, setShowNewAdventure] = useState(false)
  const [tripFilter, setTripFilter] = useState('all')
  const [planningTrip, setPlanningTrip] = useState(null)
  const [hoverTripId, setHoverTripId] = useState(null)

  const [adventureForm, setAdventureForm] = useState({
    title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'),
    location: '', category: 'spontant', rating: 0
  })

  useEffect(() => { if (user) { fetchAll(); seedHistoricalTrips() } }, [user])

  async function fetchAll() {
    const [tripsRes, advRes, sqRes] = await Promise.all([
      supabase.from('trips').select('*').eq('user_id', user.id).order('start_date', { ascending: false }),
      supabase.from('adventures').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('side_quests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setTrips(tripsRes.data || [])
    setAdventures(advRes.data || [])
    setSideQuests(sqRes.data || [])
  }

  async function seedHistoricalTrips() {
    const { data: existing } = await supabase.from('trips').select('id').eq('user_id', user.id).limit(1)
    if (existing && existing.length > 0) return
    const historicalTrips = [
      { title: 'Barcelona NYE', countries: ['Spanien'], city: 'Barcelona', start_date: '2022-12-30', end_date: '2023-01-02', status: 'completed', rating: 5, highlights: 'Nyår i Barcelona med gänget' },
      { title: 'Köpenhamn', countries: ['Danmark'], city: 'Köpenhamn', start_date: '2023-02-01', end_date: '2023-02-04', status: 'completed', rating: 4 },
      { title: 'Belgrad', countries: ['Serbien'], city: 'Belgrad', start_date: '2023-02-10', end_date: '2023-02-14', status: 'completed', rating: 5, highlights: 'Med hela gänget' },
      { title: 'Sarajevo → Abu Dhabi → Dubai', countries: ['Bosnien', 'UAE'], city: '', start_date: '2023-04-01', end_date: '2023-04-14', status: 'completed', rating: 5, highlights: 'Sarajevo, Abu Dhabi, Dubai' },
      { title: 'Polen', countries: ['Polen'], city: '', start_date: '2023-06-01', end_date: '2023-06-10', status: 'completed', rating: 3 },
      { title: 'Cypern / Ayia Napa', countries: ['Cypern'], city: 'Ayia Napa', start_date: '2023-08-01', end_date: '2023-08-10', status: 'completed', rating: 4, highlights: 'Studentresa' },
      { title: 'Prag', countries: ['Tjeckien'], city: 'Prag', start_date: '2023-09-01', end_date: '2023-09-05', status: 'completed', rating: 5, highlights: 'Skolresa, favorit' },
      { title: 'Banja Luka', countries: ['Bosnien'], city: 'Banja Luka', start_date: '2024-12-20', end_date: '2024-12-27', status: 'completed', rating: 4, highlights: 'Med Sara' },
      { title: 'Malmö → Kroatien (cykling)', countries: ['Sverige', 'Danmark', 'Tyskland', 'Österrike', 'Kroatien'], city: '', start_date: '2025-08-01', end_date: '2025-08-31', status: 'completed', rating: 5, highlights: 'Med Zinedin, en månad på cykel genom Europa' },
      { title: 'Belgrad (Viktorias födelsedag)', countries: ['Serbien'], city: 'Belgrad', start_date: '2026-03-01', end_date: '2026-03-05', status: 'completed', rating: 5, highlights: 'Viktorias födelsedag' },
      { title: 'Istanbul', countries: ['Turkiet'], city: 'Istanbul', start_date: '2026-05-20', end_date: '2026-05-24', status: 'completed', rating: 5, highlights: 'Åt hela resan, helt sjukt matlandskap' },
      { title: 'Balkanroad trip', countries: ['Serbien', 'Bosnien', 'Montenegro', 'Albanien', 'Nordmakedonien'], city: '', start_date: '2026-08-01', end_date: '2026-08-31', status: 'planned', rating: 0, notes: 'Road trip med bil genom Balkan 2026' },
    ]
    await supabase.from('trips').insert(historicalTrips.map(t => ({ ...t, user_id: user.id })))
    await fetchAll()
  }

  async function saveTrip(form) {
    setSaving(true)
    const cities = (form.cities || []).filter(c => c && c.name && Number.isFinite(c.lng) && Number.isFinite(c.lat))
    const payload = {
      user_id: user.id,
      title: form.title,
      country: form.countries?.[0] || '',
      countries: form.countries || [],
      cities,
      // keep the free-text `city` in sync — Kalender + older reads use it
      city: cities.length ? cities.map(c => c.name).join(', ') : (form.city || ''),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      highlights: form.highlights,
      rating: form.rating || null,
      status: form.status,
      budget_sek: form.budget_sek ? parseInt(form.budget_sek) : null,
      notes: form.notes,
      planning_doc: form.planning_doc || null,
      budget_items: form.budget_items || null,
    }
    const run = (p) => form.id
      ? supabase.from('trips').update(p).eq('id', form.id)
      : supabase.from('trips').insert(p)
    let { error } = await run(payload)
    // `cities` column ships in migration post_deploy_10 — degrade gracefully
    // until it lands (PostgREST 'PGRST204' / 42703 on the unknown column).
    if (error && (/cities/i.test(error.message || '') || error.code === 'PGRST204' || error.code === '42703')) {
      const { cities: _drop, ...rest } = payload
      ;({ error } = await run(rest))
    }
    if (error) { toast({ message: 'Kunde inte spara resan', type: 'error' }); console.error(error) }
    await fetchAll()
    setShowNewTrip(false)
    setEditingTrip(null)
    setSaving(false)
  }

  // Inline "avsatt hittills" edit — doesn't go through the full trip form.
  async function updateTripSaved(id, saved) {
    const val = saved === '' || saved == null ? null : Math.round(Number(saved))
    setTrips(prev => prev.map(t => t.id === id ? { ...t, saved_sek: val } : t))
    const { error } = await supabase.from('trips').update({ saved_sek: val }).eq('id', id).eq('user_id', user.id)
    if (error) { toast({ message: 'Kunde inte spara sparbeloppet', type: 'error' }); await fetchAll() }
  }

  async function saveAdventure() {
    setSaving(true)
    await supabase.from('adventures').insert({ user_id: user.id, ...adventureForm, rating: adventureForm.rating || null })
    await fetchAll()
    setAdventureForm({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), location: '', category: 'spontant', rating: 0 })
    setShowNewAdventure(false)
    setSaving(false)
  }

  async function completeQuest(id) {
    await supabase.from('side_quests').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id)
    await fetchAll()
  }

  async function skipQuest(id) {
    await supabase.from('side_quests').update({ status: 'skipped' }).eq('id', id)
    await fetchAll()
  }

  async function deleteTrip(id) {
    const removed = trips.find(t => t.id === id)
    setTrips(prev => prev.filter(t => t.id !== id))
    let undone = false
    toast({
      message: 'Resa borttagen.',
      action: { label: 'Ångra', onClick: () => { undone = true; if (removed) setTrips(prev => [...prev, removed]) } },
      duration: 5000,
    })
    setTimeout(async () => {
      if (undone) return
      await supabase.from('trips').delete().eq('id', id)
    }, 5000)
  }

  async function generateSideQuests() {
    setGeneratingQuests(true)
    try {
      const completedTrips = trips.filter(t => t.status === 'completed').slice(0, 5).map(t => t.title).join(', ')
      const completedQuests = sideQuests.filter(q => q.status === 'done').map(q => q.title).join(', ')
      // Phase 16: build the quest prompt from the user's own profile + goals
      // instead of a hardcoded biography, so quests fit whoever is logged in.
      const identity = await getUserIdentityContext(user.id)
      const profileBlock = identityToPrompt(identity)
      const whoLine = profileBlock
        ? `Det här vet vi om användaren:\n${profileBlock}`
        : 'Vi vet ännu lite om användaren — håll questsen brett motiverande och nyfikna.'
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Generera 5 personliga side quests. ${whoLine}
${completedTrips ? `Tidigare resor: ${completedTrips}.` : ''}
Tidigare avklarade quests: ${completedQuests || 'inga ännu'}.

Anpassa questsen efter användarens faktiska mål, intressen och livssituation ovan — anta inget som inte står där. Quests ska vara konkreta, lite vågade, pushande — inte "drick mer vatten". Tänk: spontanresor, sociala utmaningar, kreativa projekt, matäventyr, fysiska utmaningar, intellektuella utmaningar. Var specifik och kreativ.

Returnera ENBART JSON utan backticks:
{"quests": [{"title": "...", "description": "...", "category": "...", "difficulty": "lätt|medel|galen"}]}` }],
          context: '', systemPrompt: 'Du genererar side quests. Returnera bara JSON.',
        },
      })
      if (data?.content) {
        const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
        if (parsed.quests?.length > 0) {
          await supabase.from('side_quests').insert(parsed.quests.map(q => ({ user_id: user.id, ...q, suggested_by: 'jarvis' })))
          await fetchAll()
        }
      }
    } catch (err) { console.error(err) }
    setGeneratingQuests(false)
  }

  const completedTrips = trips.filter(t => t.status === 'completed')
  const allCountries = [...new Set(completedTrips.flatMap(t => t.countries || (t.country ? [t.country] : [])))]
  const activeQuests = sideQuests.filter(q => q.status === 'active')
  const doneQuests = sideQuests.filter(q => q.status === 'done')
  const filteredTrips = tripFilter === 'all' ? trips : trips.filter(t => t.status === tripFilter)
  // The map (WorldMap) derives country status from trips + tripFilter itself.

  const tabs = [
    { id: 'resor', label: 'Resor', icon: Compass },
    { id: 'aventyr', label: 'Äventyr', icon: Flame },
    { id: 'quests', label: 'Side Quests', icon: SkipForward },
  ]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Upplevelser</div>
          <div className="page-header-sub">
            {allCountries.length} länder · {completedTrips.length} resor · {activeQuests.length} aktiva quests
          </div>
        </div>
        <div className="page-header-actions">
          <button onClick={() => { setShowNewTrip(true); setEditingTrip(null) }} className="btn btn-primary">
            <Plus size={13} /> Ny resa
          </button>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '1080px', margin: '0 auto' }}>

      <div className="mx-segment" style={{ display: 'flex', width: '100%', marginBottom: '20px' }}>
        {tabs.map(tab => {
          const TabIcon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`mx-segment-btn ${activeTab === tab.id ? 'active' : ''}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <TabIcon size={15} className="mx-seg-ico" /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* ===== RESOR ===== */}
      {activeTab === 'resor' && (
        <>
          <div className="upp-stat-strip">
            {[
              { label: 'Genomförda', value: completedTrips.length, color: '#10b981' },
              { label: 'Länder', value: allCountries.length, color: '#3b82f6' },
              { label: 'Planerade', value: trips.filter(t => t.status === 'planned').length, color: '#8b5cf6' },
              { label: 'Dagar reste', value: completedTrips.reduce((sum, t) => sum + (t.start_date && t.end_date ? differenceInDays(parseISO(t.end_date), parseISO(t.start_date)) + 1 : 0), 0), color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="upp-stat" style={{ '--pg-c': color }}>
                <div className="upp-stat-cap">{label}</div>
                <div className="upp-stat-num mono">{value}</div>
              </div>
            ))}
          </div>

          <div className="upp-filter-row">
            {[{ id: 'all', label: 'Alla' }, ...TRIP_STATUSES].map(({ id, label }) => {
              const n = id === 'all' ? trips.length : trips.filter(t => t.status === id).length
              return (
                <button key={id} onClick={() => setTripFilter(id)}
                  className={`upp-filter-chip${tripFilter === id ? ' is-active' : ''}`}>
                  {label} <span style={{ opacity: 0.6 }}>{n}</span>
                </button>
              )
            })}
          </div>

          {(showNewTrip && !editingTrip) && (
            <TripForm initial={EMPTY_TRIP} onSave={saveTrip} onCancel={() => setShowNewTrip(false)} saving={saving} />
          )}

          <div className="upp-resor-layout">
          <div className="upp-map-col">
            <Suspense fallback={<div className="upp-map-panel" style={{ minHeight: 260, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>Laddar karta…</div>}>
              <WorldMap trips={trips} tripFilter={tripFilter} highlightTripId={hoverTripId}
                onFixCities={(id) => {
                  setEditingTrip(id); setExpandedTrip(null); setShowNewTrip(false)
                  requestAnimationFrame(() => document.getElementById(`trip-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
                }} />
            </Suspense>
          </div>
          <div className="upp-trips-scroll" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredTrips.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                {trips.length === 0 ? 'Inga resor ännu — lägg till din första.' : 'Inga resor med den statusen.'}
              </div>
            )}
            {filteredTrips.map(trip => {
              const isExpanded = expandedTrip === trip.id
              const isEditing = editingTrip === trip.id
              const status = TRIP_STATUSES.find(s => s.id === trip.status)
              const tripCountries = trip.countries?.length ? trip.countries : (trip.country ? [trip.country] : [])
              const days = trip.start_date && trip.end_date
                ? differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1
                : null
              const daysUntil = trip.status === 'planned' && trip.start_date
                ? differenceInDays(parseISO(trip.start_date), new Date())
                : null

              if (isEditing) {
                return (
                  <div key={trip.id} id={`trip-${trip.id}`}>
                    <TripForm
                      initial={{ ...trip, budget_sek: trip.budget_sek || '', countries: tripCountries, cities: Array.isArray(trip.cities) ? trip.cities : [], rating: trip.rating || 0 }}
                      onSave={saveTrip}
                      onCancel={() => setEditingTrip(null)}
                      saving={saving}
                    />
                  </div>
                )
              }

              return (
                <div key={trip.id} id={`trip-${trip.id}`} className="card" style={{
                  borderColor: hoverTripId === trip.id ? 'var(--accent)'
                    : trip.status === 'planned' ? 'rgba(59,130,246,0.3)' : trip.status === 'idea' ? 'rgba(139,92,246,0.2)' : 'var(--border)',
                  transition: 'border-color .15s',
                }}
                  onMouseEnter={() => setHoverTripId(trip.id)} onMouseLeave={() => setHoverTripId(null)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                    onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}>
                    <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '18px', lineHeight: 1.05, flexShrink: 0, paddingTop: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                        {tripCountries.slice(0, 3).map((c, i) => <span key={i}>{FLAGS[c] || '🌍'}</span>)}
                        {tripCountries.length > 3 && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>+{tripCountries.length - 3}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', minWidth: 0, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{trip.title}</div>
                          <span style={{ flexShrink: 0, fontSize: '10px', padding: '2px 8px', borderRadius: '999px', marginTop: '1px',
                            background: status?.color + '20', color: status?.color, fontWeight: '700' }}>
                            {status?.label}
                          </span>
                          {daysUntil !== null && daysUntil >= 0 && (
                            <span style={{ flexShrink: 0, fontSize: '11px', color: '#3b82f6', fontWeight: '700' }}>om {daysUntil}d</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                          {tripCountries.length > 0 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{tripCountries.join(' · ')}</span>}
                          {trip.city && <span>📍 {trip.city}</span>}
                          {trip.start_date && <span>{format(parseISO(trip.start_date), 'MMM yyyy', { locale: sv })}</span>}
                          {days && <span>{days} d</span>}
                          {trip.rating > 0 && <span style={{ color: '#f59e0b' }}>{'★'.repeat(trip.rating)}</span>}
                        </div>
                        {(trip.status === 'idea' || trip.status === 'planned') && (
                          <button onClick={e => { e.stopPropagation(); setPlanningTrip(trip) }} className="upp-plan-btn" style={{ marginTop: 9 }}>
                            <FileText size={12} /> Planera
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setEditingTrip(trip.id); setExpandedTrip(null) }}
                        title="Redigera resa" aria-label={`Redigera ${trip.title}`}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', opacity: 0.6 }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteTrip(trip.id) }}
                        title="Ta bort resa" aria-label={`Ta bort ${trip.title}`}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: '4px' }}>
                        <X size={13} />
                      </button>
                      {isExpanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                    </div>
                  </div>

                  {isExpanded && (trip.highlights || trip.notes || trip.planning_doc || trip.budget_sek) && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {trip.highlights && (
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>HIGHLIGHTS</div>
                          <div style={{ fontSize: '13px', lineHeight: '1.6' }}>{trip.highlights}</div>
                        </div>
                      )}
                      {(trip.planning_doc || trip.notes) && (
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>
                            {trip.status === 'planned' || trip.status === 'idea' ? 'PLANERING' : 'ANTECKNINGAR'}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{trip.planning_doc || trip.notes}</div>
                        </div>
                      )}
                      {trip.budget_items?.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>BUDGET</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {trip.budget_items.map((item, i) => {
                              const cat = BUDGET_CATEGORIES ? BUDGET_CATEGORIES.find(c => c.id === item.category) : null
                              return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ color: 'var(--muted)' }}>{cat?.icon || '•'} {cat?.label || item.category}{item.description ? ` — ${item.description.slice(0, 40)}${item.description.length > 40 ? '...' : ''}` : ''}</span>
                                  <span style={{ color: item.isEstimate ? '#f59e0b' : 'var(--text)', fontWeight: '600' }}>
                                    {item.amount ? `${parseFloat(item.amount).toLocaleString('sv-SE')} kr${item.isEstimate ? ' (est.)' : ''}` : '—'}
                                  </span>
                                </div>
                              )
                            })}
                            {trip.budget_sek > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', paddingTop: '6px', fontWeight: '700' }}>
                                <span>Totalt</span>
                                <span style={{ color: 'var(--accent)' }}>{trip.budget_sek.toLocaleString('sv-SE')} kr</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {trip.budget_sek > 0 && !trip.budget_items?.length && (
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          💰 Budget: <span style={{ color: 'var(--text)', fontWeight: '600' }}>{trip.budget_sek.toLocaleString('sv-SE')} kr</span>
                        </div>
                      )}
                      {(trip.status === 'planned' || trip.status === 'idea') && trip.budget_sek > 0 && (
                        <TripSavings trip={trip} onSave={(v) => updateTripSaved(trip.id, v)} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </>
      )}

      {/* ===== ÄVENTYR ===== */}
      {activeTab === 'aventyr' && (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <button onClick={() => setShowNewAdventure(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Nytt äventyr
          </button>

          {showNewAdventure && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Logga äventyr</div>
                <button onClick={() => setShowNewAdventure(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Titel</label>
                  <input className="input" placeholder="Vad hände?" value={adventureForm.title} onChange={e => setAdventureForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={adventureForm.date} onChange={e => setAdventureForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Plats</label>
                  <input className="input" placeholder="Var?" value={adventureForm.location} onChange={e => setAdventureForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kategori</label>
                  <select className="input" value={adventureForm.category} onChange={e => setAdventureForm(f => ({ ...f, category: e.target.value }))}>
                    {ADVENTURE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Beskrivning</label>
                  <textarea className="input" rows={3} placeholder="Berätta vad som hände..." value={adventureForm.description} onChange={e => setAdventureForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Betyg</label>
                  <StarRating value={adventureForm.rating} onChange={v => setAdventureForm(f => ({ ...f, rating: v }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewAdventure(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveAdventure} className="btn btn-primary" disabled={saving || !adventureForm.title}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {adventures.length === 0 ? (
            <EmptyState icon={Compass} title="Inga äventyr loggade ännu"
              text="Logga ett spontant äventyr — eller be Jarvis göra det åt dig i chatten."
              action={{ label: 'Logga äventyr', onClick: () => setShowNewAdventure(true) }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {adventures.map(adv => (
                <div key={adv.id} className="card">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{adv.title}</div>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{adv.category}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '10px', marginBottom: adv.description ? '8px' : '0' }}>
                    {adv.date && <span>{format(parseISO(adv.date), 'd MMM yyyy', { locale: sv })}</span>}
                    {adv.location && <span>📍 {adv.location}</span>}
                    {adv.rating > 0 && <span style={{ color: '#f59e0b' }}>{'★'.repeat(adv.rating)}</span>}
                  </div>
                  {adv.description && <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', fontStyle: 'italic' }}>{adv.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== SIDE QUESTS ===== */}
      {activeTab === 'quests' && (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{activeQuests.length} aktiva · {doneQuests.length} avklarade</div>
            <button onClick={generateSideQuests} disabled={generatingQuests} style={{
              display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px',
              borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)', color: '#f87171',
              cursor: 'pointer', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: '600',
            }}>
              {generatingQuests ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Flame size={13} />}
              Generera nya quests
            </button>
          </div>

          {activeQuests.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>AKTIVA</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activeQuests.map(quest => {
                  const diff = DIFFICULTIES.find(d => d.id === quest.difficulty)
                  return (
                    <div key={quest.id} className="card" style={{ borderColor: diff?.color + '30' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>{quest.title}</div>
                        {diff && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: diff.color + '20', color: diff.color, fontWeight: '600' }}>{diff.label}</span>}
                      </div>
                      {quest.description && <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '10px' }}>{quest.description}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => completeQuest(quest.id)} style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                          borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)',
                          background: 'rgba(16,185,129,0.08)', color: '#10b981',
                          cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                        }}><Check size={12} /> Avklarad</button>
                        <button onClick={() => skipQuest(quest.id)} style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
                          borderRadius: '6px', border: '1px solid var(--border)',
                          background: 'transparent', color: 'var(--muted)',
                          cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                        }}><SkipForward size={12} /> Skippa</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {doneQuests.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>AVKLARADE 🏆</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {doneQuests.map(quest => (
                  <div key={quest.id} style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#10b981' }}>✓ {quest.title}</div>
                    {quest.completed_at && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(quest.completed_at), 'd MMM', { locale: sv })}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {sideQuests.length === 0 && (
            <EmptyState icon={Flame} title="Inga side quests ännu"
              text="Låt Jarvis föreslå nya spontana utmaningar baserat på dina mål."
              action={{ label: generatingQuests ? 'Genererar…' : 'Generera quests', onClick: generateSideQuests }} />
          )}
        </div>
      )}

      {planningTrip && (
        <TripPlannerModal
          trip={planningTrip}
          onClose={() => setPlanningTrip(null)}
          onSave={async (updatedTrip) => {
            await saveTrip(updatedTrip)
            setPlanningTrip(null)
          }}
        />
      )}
        </div>
      </div>
    </div>
  )
}
