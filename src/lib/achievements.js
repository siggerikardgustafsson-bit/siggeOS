// Pure achievement logic — derived entirely from existing data, no DB writes.
// Each achievement: { id, title, desc, group, color, value, target, unlocked, progressPct }

const TIER_COLORS = {
  2:'#4f8ef7', 3:'#a78bfa', 4:'#fbbf24', 5:'#34d399', 6:'#22d3ee', 7:'#f472b6', 8:'#fbbf24',
}

// Longest run of consecutive days ending today (or yesterday) in a set of ISO dates.
export function currentStreak(dates) {
  const set = new Set(dates)
  if (!set.size) return 0
  const day = (d) => d.toISOString().slice(0, 10)
  const t = new Date()
  // Allow the streak to count from today or yesterday so a not-yet-logged today doesn't zero it.
  let cursor = set.has(day(t)) ? t : new Date(t.getTime() - 86400000)
  if (!set.has(day(cursor))) return 0
  let n = 0
  while (set.has(day(cursor))) { n++; cursor = new Date(cursor.getTime() - 86400000) }
  return n
}

const milestone = ({ id, title, desc, group, color, value, target }) => ({
  id, title, desc, group, color,
  value, target,
  unlocked: value >= target,
  progressPct: Math.max(0, Math.min(100, Math.round((value / target) * 100))),
})

export function deriveAchievements(stats) {
  const {
    categories = [], prCount = 0, sessionCount = 0,
    totalDistance = 0, studyHours = 0, streak = 0,
  } = stats
  const out = []

  // Performance tier badges (one per category that has reached T2+)
  for (const c of categories) {
    const t = c?.tier?.tier
    if (c?.hasData && t >= 2) {
      out.push({
        id: 'tier-' + c.id, title: `${c.name} · T${t}`, desc: `${c.tier.label} i ${c.name}`,
        group: 'Tiers', color: TIER_COLORS[t] || '#4f8ef7', value: t, target: t, unlocked: true, progressPct: 100,
      })
    }
  }

  // Volume / consistency milestones (show next locked tier of each so there's always a goal)
  const ladders = [
    { base: 'pass', group: 'Träning', color: '#4f8ef7', value: sessionCount, unit: 'pass',
      steps: [{ t: 1, title: 'Första passet' }, { t: 10, title: '10 pass' }, { t: 50, title: '50 pass' }, { t: 150, title: '150 pass' }] },
    { base: 'dist', group: 'Träning', color: '#22d3ee', value: Math.round(totalDistance), unit: 'km',
      steps: [{ t: 25, title: '25 km' }, { t: 100, title: '100 km' }, { t: 250, title: '250 km' }, { t: 500, title: '500 km' }] },
    { base: 'pr', group: 'Rekord', color: '#f472b6', value: prCount, unit: 'PR',
      steps: [{ t: 1, title: 'Första PR:t' }, { t: 5, title: '5 PR' }, { t: 15, title: '15 PR' }, { t: 30, title: '30 PR' }] },
    { base: 'study', group: 'Plugg', color: '#a78bfa', value: Math.round(studyHours), unit: 'h',
      steps: [{ t: 10, title: '10h plugg' }, { t: 50, title: '50h plugg' }, { t: 150, title: '150h plugg' }] },
    { base: 'streak', group: 'Konsistens', color: '#34d399', value: streak, unit: 'dgr',
      steps: [{ t: 3, title: '3 dagars streak' }, { t: 7, title: '7 dagars streak' }, { t: 30, title: '30 dagars streak' }] },
  ]

  for (const l of ladders) {
    let shownLocked = false
    for (const s of l.steps) {
      const unlocked = l.value >= s.t
      // Show every unlocked step + the FIRST locked step (the active goal).
      if (!unlocked && shownLocked) continue
      if (!unlocked) shownLocked = true
      out.push(milestone({
        id: l.base + '-' + s.t, title: s.title, desc: `${l.value}/${s.t} ${l.unit}`,
        group: l.group, color: l.color, value: l.value, target: s.t,
      }))
    }
  }

  return out
}
