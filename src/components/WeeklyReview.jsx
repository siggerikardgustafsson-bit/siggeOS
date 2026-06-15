import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { X, Moon, Battery, Smile, Dumbbell, GraduationCap, Gauge, ArrowUp, ArrowDown, Minus, Sparkles } from 'lucide-react'

const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
const r1 = (n) => n == null ? null : Math.round(n * 10) / 10

function Delta({ now, prev, invert = false, unit = '' }) {
  if (now == null || prev == null) return null
  const diff = r1(now - prev)
  if (diff === 0) return <span className="wr-delta wr-flat"><Minus size={11} /> 0{unit}</span>
  const good = invert ? diff < 0 : diff > 0
  return (
    <span className={'wr-delta ' + (good ? 'wr-up' : 'wr-down')}>
      {diff > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {diff > 0 ? '+' : ''}{diff}{unit}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, unit, color, now, prev, invert }) {
  return (
    <div className="wr-stat" style={{ '--wc': color }}>
      <div className="wr-stat-head">
        <span className="wr-stat-ico"><Icon size={15} /></span>
        <span className="wr-stat-label">{label}</span>
      </div>
      <div className="wr-stat-val">{value != null ? value : '—'}<span className="wr-stat-unit">{value != null ? unit : ''}</span></div>
      <Delta now={now} prev={prev} invert={invert} unit={unit} />
    </div>
  )
}

export default function WeeklyReview({ userId, onClose }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!userId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const today = new Date()
      const thisStart = format(subDays(today, 6), 'yyyy-MM-dd')   // last 7 days incl today
      const prevStart = format(subDays(today, 13), 'yyyy-MM-dd')
      const prevEnd = format(subDays(today, 7), 'yyyy-MM-dd')
      const todayStr = format(today, 'yyyy-MM-dd')

      const [{ data: health }, { data: training }, { data: study }, { data: scores }] = await Promise.all([
        supabase.from('health_logs').select('date,sleep_hours,energy,energy_level,mood,weight_kg,steps').eq('user_id', userId).gte('date', prevStart).lte('date', todayStr),
        supabase.from('training_sessions').select('date,session_type,distance_km,duration_minutes').eq('user_id', userId).gte('date', prevStart).lte('date', todayStr),
        supabase.from('study_sessions').select('date,hours').eq('user_id', userId).gte('date', prevStart).lte('date', todayStr),
        supabase.from('daily_scores').select('date,total_score').eq('user_id', userId).gte('date', prevStart).lte('date', todayStr),
      ])

      if (!alive) return
      const inThis = (r) => r.date >= thisStart
      const inPrev = (r) => r.date >= prevStart && r.date <= prevEnd
      const energyOf = (r) => r.energy_level ?? r.energy

      const hThis = (health || []).filter(inThis), hPrev = (health || []).filter(inPrev)
      const tThis = (training || []).filter(inThis), tPrev = (training || []).filter(inPrev)
      const sThis = (study || []).filter(inThis), sPrev = (study || []).filter(inPrev)
      const scThis = (scores || []).filter(inThis), scPrev = (scores || []).filter(inPrev)

      const sleepThis = r1(avg(hThis.map(h => h.sleep_hours).filter(Boolean)))
      const bestSleep = hThis.map(h => h.sleep_hours).filter(Boolean).sort((a, b) => b - a)[0] || null
      const studyThis = r1(sThis.reduce((s, r) => s + Number(r.hours || 0), 0))
      const distThis = r1(tThis.reduce((s, r) => s + Number(r.distance_km || 0), 0))
      const weights = hThis.map(h => h.weight_kg).filter(Boolean)

      setData({
        weekLabel: `${format(subDays(today, 6), 'd MMM', { locale: sv })} – ${format(today, 'd MMM', { locale: sv })}`,
        sleep: { now: sleepThis, prev: r1(avg(hPrev.map(h => h.sleep_hours).filter(Boolean))) },
        energy: { now: r1(avg(hThis.map(energyOf).filter(Boolean))), prev: r1(avg(hPrev.map(energyOf).filter(Boolean))) },
        mood: { now: r1(avg(hThis.map(h => h.mood).filter(Boolean))), prev: r1(avg(hPrev.map(h => h.mood).filter(Boolean))) },
        training: { now: tThis.length, prev: tPrev.length },
        study: { now: studyThis, prev: r1(sPrev.reduce((s, r) => s + Number(r.hours || 0), 0)) },
        score: { now: r1(avg(scThis.map(s => s.total_score).filter(v => v != null))), prev: r1(avg(scPrev.map(s => s.total_score).filter(v => v != null))) },
        highlights: [
          bestSleep && `Bästa sömnnatten: ${r1(bestSleep)}h`,
          tThis.length ? `${tThis.length} pass loggade${distThis ? ` · ${distThis} km` : ''}` : 'Inga pass loggade denna vecka',
          studyThis ? `${studyThis}h studietid` : null,
          weights.length >= 2 ? `Vikttrend: ${r1(weights[0] - weights[weights.length - 1]) > 0 ? '+' : ''}${r1(weights[0] - weights[weights.length - 1])} kg` : null,
        ].filter(Boolean),
        logDays: new Set(hThis.map(h => h.date)).size,
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [userId])

  return (
    <div className="wr-overlay" onClick={onClose}>
      <style>{`
        .wr-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;
          background:rgba(4,6,12,0.62); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); animation:wrFade .28s ease both; }
        [data-theme="light"] .wr-overlay { background:rgba(225,228,238,0.55); }
        @keyframes wrFade { from { opacity:0 } to { opacity:1 } }
        .wr-panel { position:relative; width:100%; max-width:600px; max-height:88vh; overflow-y:auto; overflow-x:hidden; border-radius:26px;
          background:var(--modal-bg); border:1px solid var(--modal-border); backdrop-filter:blur(44px) saturate(1.2); -webkit-backdrop-filter:blur(44px) saturate(1.2);
          box-shadow:0 40px 100px -24px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.1) inset; scrollbar-width:none; animation:wrRise .42s cubic-bezier(.22,1,.36,1) both; }
        .wr-panel::-webkit-scrollbar { display:none; }
        @keyframes wrRise { from { opacity:0; transform:translateY(18px) scale(.97) } to { opacity:1; transform:none } }
        .wr-hero { position:relative; padding:24px 26px 20px; overflow:hidden;
          background:radial-gradient(120% 100% at 0% 0%, var(--accent-soft), transparent 55%); }
        .wr-kick { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:var(--accent); }
        .wr-title { font-family:'Playfair Display', Georgia, serif; font-style:italic; font-weight:900; font-size:clamp(30px,5vw,44px); letter-spacing:-0.04em; color:var(--text); line-height:1; margin-top:8px; }
        .wr-sub { font-size:12.5px; color:var(--muted2); margin-top:7px; }
        .wr-close { position:absolute; top:18px; right:18px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; border-radius:11px;
          background:var(--surface2); border:1px solid var(--border); color:var(--muted2); cursor:pointer; transition:transform .16s, background .16s, color .16s; }
        .wr-close:hover { background:var(--surface3); color:var(--text); transform:rotate(90deg); }
        .wr-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; padding:4px 22px 0; }
        @media (max-width:520px){ .wr-grid { grid-template-columns:repeat(2, minmax(0,1fr)); } }
        .wr-stat { padding:13px; border-radius:15px; background:var(--surface2); border:1px solid var(--border); }
        .wr-stat-head { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
        .wr-stat-ico { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; color:var(--wc); background:color-mix(in srgb, var(--wc) 14%, transparent); border:1px solid color-mix(in srgb, var(--wc) 30%, transparent); }
        .wr-stat-label { font-size:11px; font-weight:700; color:var(--muted2); }
        .wr-stat-val { font-size:24px; font-weight:900; color:var(--text); letter-spacing:-0.03em; line-height:1; }
        .wr-stat-unit { font-size:13px; font-weight:700; color:var(--muted); margin-left:2px; }
        .wr-delta { display:inline-flex; align-items:center; gap:3px; margin-top:7px; font-size:11px; font-weight:800; }
        .wr-up { color:var(--green); } .wr-down { color:var(--red); } .wr-flat { color:var(--muted); }
        .wr-section { padding:18px 22px 0; }
        .wr-slabel { display:flex; align-items:center; gap:7px; margin-bottom:10px; font-size:10.5px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); }
        .wr-hl { display:flex; align-items:center; gap:9px; padding:11px 13px; border-radius:12px; background:var(--surface2); border:1px solid var(--border); margin-bottom:7px; font-size:13px; color:var(--text); font-weight:600; }
        .wr-hl-dot { width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 8px var(--accent-glow); flex-shrink:0; }
        .wr-cta { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; margin-top:4px; border-radius:15px; border:none; cursor:pointer;
          font-size:13.5px; font-weight:800; color:#fff; background:linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 74%, #060914)); box-shadow:0 8px 26px -8px var(--accent-glow); transition:transform .16s, filter .16s; }
        .wr-cta:hover { transform:translateY(-2px); filter:brightness(1.06); }
        .wr-skel { height:84px; border-radius:15px; }
        @media (prefers-reduced-motion: reduce){ .wr-overlay,.wr-panel { animation:none } .wr-close:hover { transform:none } }
      `}</style>
      <div className="wr-panel" onClick={e => e.stopPropagation()}>
        <button className="wr-close" onClick={onClose} aria-label="Stäng"><X size={16} /></button>
        <div className="wr-hero">
          <span className="wr-kick"><Sparkles size={12} /> Veckorevy</span>
          <div className="wr-title">Din vecka</div>
          <div className="wr-sub">{loading ? 'Sammanställer…' : `${data?.weekLabel || ''}${data?.logDays != null ? ` · loggat ${data.logDays}/7 dagar` : ''}`}</div>
        </div>

        {loading ? (
          <div className="wr-grid">{[...Array(6)].map((_, i) => <div key={i} className="wr-stat mx-skel wr-skel" />)}</div>
        ) : (
          <>
            <div className="wr-grid">
              <StatCard icon={Moon} label="Sömn" value={data.sleep.now} unit="h" color="#8b5cf6" now={data.sleep.now} prev={data.sleep.prev} />
              <StatCard icon={Battery} label="Energi" value={data.energy.now} unit="" color="#fbbf24" now={data.energy.now} prev={data.energy.prev} />
              <StatCard icon={Smile} label="Humör" value={data.mood.now} unit="" color="#34d399" now={data.mood.now} prev={data.mood.prev} />
              <StatCard icon={Dumbbell} label="Pass" value={data.training.now} unit="" color="#4f8ef7" now={data.training.now} prev={data.training.prev} />
              <StatCard icon={GraduationCap} label="Studietid" value={data.study.now} unit="h" color="#22d3ee" now={data.study.now} prev={data.study.prev} />
              <StatCard icon={Gauge} label="Score" value={data.score.now} unit="" color="#f472b6" now={data.score.now} prev={data.score.prev} />
            </div>

            {data.highlights.length > 0 && (
              <div className="wr-section">
                <div className="wr-slabel"><span style={{ width:3, height:12, borderRadius:2, background:'var(--accent)', boxShadow:'0 0 8px var(--accent-glow)' }} /> Veckans signaler</div>
                {data.highlights.map((h, i) => <div key={i} className="wr-hl"><span className="wr-hl-dot" /> {h}</div>)}
              </div>
            )}

            <div className="wr-section" style={{ paddingBottom:22 }}>
              <button className="wr-cta" onClick={() => { onClose?.(); navigate('/jarvis') }}>
                <Sparkles size={15} /> Be Jarvis om djupanalys
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
