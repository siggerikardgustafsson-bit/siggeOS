import { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { deriveAchievements, currentStreak } from '../lib/achievements'
import { X, Trophy, Lock, Check } from 'lucide-react'

export default function AchievementsModal({ userId, categories = [], onClose }) {
  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState([])

  useEffect(() => {
    if (!userId) return
    let alive = true
    const safe = (p) => p.then(r => r).catch(() => ({ data: [], count: 0 }))
    ;(async () => {
      setLoading(true)
      const since60 = format(subDays(new Date(), 60), 'yyyy-MM-dd')
      const [sess, dist, pr1, pr2, study, health] = await Promise.all([
        safe(supabase.from('training_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
        safe(supabase.from('training_sessions').select('distance_km').eq('user_id', userId).not('distance_km', 'is', null)),
        safe(supabase.from('personal_records').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
        safe(supabase.from('run_personal_records').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
        safe(supabase.from('study_sessions').select('hours').eq('user_id', userId)),
        safe(supabase.from('health_logs').select('date').eq('user_id', userId).gte('date', since60)),
      ])
      if (!alive) return
      const stats = {
        categories,
        sessionCount: sess.count || 0,
        totalDistance: (dist.data || []).reduce((s, r) => s + Number(r.distance_km || 0), 0),
        prCount: (pr1.count || 0) + (pr2.count || 0),
        studyHours: (study.data || []).reduce((s, r) => s + Number(r.hours || 0), 0),
        streak: currentStreak((health.data || []).map(h => h.date)),
      }
      setBadges(deriveAchievements(stats))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [userId, categories])

  const unlocked = badges.filter(b => b.unlocked)
  const groups = [...new Set(badges.map(b => b.group))]

  return (
    <div className="ac-overlay" onClick={onClose}>
      <style>{`
        .ac-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;
          background:rgba(4,6,12,0.62); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); animation:acFade .28s ease both; }
        [data-theme="light"] .ac-overlay { background:rgba(225,228,238,0.55); }
        @keyframes acFade { from { opacity:0 } to { opacity:1 } }
        .ac-panel { position:relative; width:100%; max-width:640px; max-height:88vh; overflow-y:auto; overflow-x:hidden; border-radius:26px;
          background:var(--modal-bg); border:1px solid var(--modal-border); backdrop-filter:blur(44px) saturate(1.2); -webkit-backdrop-filter:blur(44px) saturate(1.2);
          box-shadow:0 40px 100px -24px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.1) inset; scrollbar-width:none; animation:acRise .42s cubic-bezier(.22,1,.36,1) both; }
        .ac-panel::-webkit-scrollbar { display:none; }
        @keyframes acRise { from { opacity:0; transform:translateY(18px) scale(.97) } to { opacity:1; transform:none } }
        .ac-hero { position:relative; padding:24px 26px 18px; overflow:hidden;
          background:radial-gradient(120% 100% at 0% 0%, color-mix(in srgb,#fbbf24 16%,transparent), transparent 55%); }
        .ac-kick { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#fbbf24; }
        .ac-title { font-family:'Playfair Display', Georgia, serif; font-style:italic; font-weight:900; font-size:clamp(28px,5vw,42px); letter-spacing:-0.04em; color:var(--text); line-height:1; margin-top:8px; }
        .ac-sub { font-size:12.5px; color:var(--muted2); margin-top:7px; }
        .ac-close { position:absolute; top:18px; right:18px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; border-radius:11px;
          background:var(--surface2); border:1px solid var(--border); color:var(--muted2); cursor:pointer; transition:transform .16s, background .16s, color .16s; }
        .ac-close:hover { background:var(--surface3); color:var(--text); transform:rotate(90deg); }
        .ac-section { padding:14px 22px 0; }
        .ac-slabel { font-size:10.5px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); margin-bottom:10px; display:flex; align-items:center; gap:7px; }
        .ac-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:10px; }
        .ac-badge { position:relative; padding:14px; border-radius:16px; border:1px solid var(--border); background:var(--surface2); overflow:hidden;
          transition:transform .18s, box-shadow .18s, border-color .18s; }
        .ac-badge.on { border-color:color-mix(in srgb, var(--bc) 45%, transparent);
          background:linear-gradient(160deg, color-mix(in srgb, var(--bc) 16%, transparent), var(--surface2)); }
        .ac-badge.on:hover { transform:translateY(-3px); box-shadow:0 14px 30px -12px color-mix(in srgb, var(--bc) 70%, transparent); }
        .ac-badge.off { opacity:0.62; }
        .ac-medal { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; margin-bottom:10px; }
        .ac-badge.on .ac-medal { color:#fff; background:radial-gradient(circle at 35% 30%, color-mix(in srgb,var(--bc) 80%,#fff 10%), var(--bc));
          box-shadow:0 6px 16px -4px var(--bc), inset 0 1px 0 rgba(255,255,255,.4); }
        .ac-badge.off .ac-medal { color:var(--muted); background:var(--surface3); border:1px solid var(--border); }
        .ac-bt { font-size:13px; font-weight:800; color:var(--text); letter-spacing:-0.01em; }
        .ac-bd { font-size:11px; color:var(--muted); margin-top:3px; }
        .ac-track { height:5px; border-radius:999px; background:var(--surface3); overflow:hidden; margin-top:9px; }
        .ac-fill { height:100%; border-radius:999px; background:var(--bc); }
        .ac-check { position:absolute; top:12px; right:12px; color:var(--bc); }
        @media (prefers-reduced-motion: reduce){ .ac-overlay,.ac-panel { animation:none } .ac-close:hover { transform:none } }
      `}</style>
      <div className="ac-panel" onClick={e => e.stopPropagation()}>
        <button className="ac-close" onClick={onClose} aria-label="Stäng"><X size={16} /></button>
        <div className="ac-hero">
          <span className="ac-kick"><Trophy size={12} /> Utmärkelser</span>
          <div className="ac-title">Dina medaljer</div>
          <div className="ac-sub">{loading ? 'Räknar dina bedrifter…' : `${unlocked.length} av ${badges.length} upplåsta`}</div>
        </div>

        {loading ? (
          <div className="ac-section"><div className="ac-grid">{[...Array(8)].map((_, i) => <div key={i} className="ac-badge mx-skel" style={{ height: 118 }} />)}</div></div>
        ) : (
          groups.map(g => (
            <div key={g} className="ac-section" style={{ paddingBottom: g === groups[groups.length - 1] ? 22 : 0 }}>
              <div className="ac-slabel">{g}</div>
              <div className="ac-grid">
                {badges.filter(b => b.group === g).map(b => (
                  <div key={b.id} className={'ac-badge ' + (b.unlocked ? 'on' : 'off')} style={{ '--bc': b.color }}>
                    {b.unlocked && <Check size={15} className="ac-check" />}
                    <div className="ac-medal">{b.unlocked ? <Trophy size={18} /> : <Lock size={16} />}</div>
                    <div className="ac-bt">{b.title}</div>
                    <div className="ac-bd">{b.desc}</div>
                    {!b.unlocked && (
                      <div className="ac-track"><div className="ac-fill" style={{ width: b.progressPct + '%' }} /></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
