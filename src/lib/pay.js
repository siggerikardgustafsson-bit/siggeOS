// Pay engine: prices a shift from its employment's pay rules (post_deploy_28).
// Shared by Jobb, tierCompute (Dashboard + nightly snapshot), Jarvis and the
// calendar sync via the server bundle, so it must stay runtime-agnostic: no
// supabase import, no date-fns, and all clock logic in Europe/Stockholm
// (a server in UTC must price a 22:00 shift as night, not as 20:00).

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
})
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function stockholm(date) {
  const p = {}
  for (const { type, value } of PARTS.formatToParts(date)) p[type] = value
  return {
    year: Number(p.year), mmdd: `${p.month}-${p.day}`, weekday: WEEKDAYS[p.weekday],
    minute: Number(p.hour) * 60 + Number(p.minute),
  }
}

// ── Storhelger (fixed + Easter-based + midsommarafton) ──
const FIXED_HOLIDAYS = ['01-01', '01-06', '05-01', '06-06', '12-24', '12-25', '12-26', '12-31']
const holidayCache = {}
function mmddUTC(d) { return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
function holidaysFor(year) {
  if (holidayCache[year]) return holidayCache[year]
  // Computus (Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  const easter = Date.UTC(year, month - 1, day)
  const set = new Set(FIXED_HOLIDAYS)
  for (const off of [-2, -1, 0, 1, 39]) set.add(mmddUTC(new Date(easter + off * 86400000)))
  for (let dd = 19; dd <= 25; dd++) {
    const mid = new Date(Date.UTC(year, 5, dd))
    if (mid.getUTCDay() === 5) { set.add(mmddUTC(mid)); break }
  }
  return (holidayCache[year] = set)
}
export function isStorhelg(date) {
  const s = stockholm(date)
  return holidaysFor(s.year).has(s.mmdd)
}

const toMin = (hhmm, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback
}
// from–to on the clock; to <= from crosses midnight; 00:00–24:00 = all day.
function inWindow(minute, from, to) {
  const f = toMin(from, 0), t = toMin(to, 1440)
  if (f === t) return true
  return f < t ? minute >= f && minute < t : minute >= f || minute < t
}

// A window that crosses midnight belongs to the day it STARTS: "fre 19–06"
// = Friday evening into Saturday morning (not Friday's early hours), so the
// after-midnight part is matched against the previous day.
function ruleMatches(rule, s, holiday) {
  if (!inWindow(s.minute, rule.from, rule.to)) return false
  const f = toMin(rule.from, 0), t = toMin(rule.to, 1440)
  const fromPrevDay = f > t && s.minute < t
  if (rule.holiday) return fromPrevDay ? s.prevHoliday : holiday
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days : [0, 1, 2, 3, 4, 5, 6]
  return days.map(Number).includes(fromPrevDay ? (s.weekday + 6) % 7 : s.weekday)
}

const matchingKr = (rules, s, holiday) => (rules || []).filter(r => Number(r.kr) > 0 && ruleMatches(r, s, holiday))

// OB kr/h for one moment, per the employment's ob_mode + exclusive rules.
function obAt(emp, s, holiday) {
  const matched = matchingKr(emp.ob_rules, s, holiday)
  if (!matched.length) return 0
  const excl = matched.filter(r => r.exclusive)
  if (excl.length) return Math.max(...excl.map(r => Number(r.kr)))
  const krs = matched.map(r => Number(r.kr))
  return emp.ob_mode === 'highest' ? Math.max(...krs) : krs.reduce((a, b) => a + b, 0)
}

const SLICE_MS = 15 * 60000 // Stockholm offsets are whole hours → quarters align

// Price one shift. Returns null when it cannot be priced (no times, monthly
// job, no rate). breakdown is in kr; gross includes semesterersättning.
export function priceShift(shift, emp) {
  if (!shift?.start_time || !shift?.end_time || !emp || emp.kind === 'monthly') return null
  const start = new Date(shift.start_time).getTime(), end = new Date(shift.end_time).getTime()
  if (!(end > start)) return null
  const base = Number(emp.hourly_rate) || 0
  const jourRate = emp.jour_rate != null && emp.jour_rate !== '' ? Number(emp.jour_rate) : null
  const sov = shift.shift_type === 'sov'
  const hasJour = jourRate != null || (emp.jour_rules || []).some(r => Number(r.kr) > 0)
  const out = { base: 0, ob: 0, jour: 0, holiday: 0, hours: 0, jourHours: 0 }
  for (let t = start; t < end; ) {
    const next = Math.min(end, (Math.floor(t / SLICE_MS) + 1) * SLICE_MS)
    const hours = (next - t) / 3600000
    const at = new Date(t), s = stockholm(at), holiday = holidaysFor(s.year).has(s.mmdd)
    const prev = stockholm(new Date(t - 86400000))
    s.prevHoliday = holidaysFor(prev.year).has(prev.mmdd)
    const isJour = sov && hasJour && inWindow(s.minute, emp.jour_from || '22:00', emp.jour_to || '06:00')
    if (isJour) {
      // jour_rules (per day/holiday) override the flat jour_rate; highest wins.
      const special = matchingKr(emp.jour_rules, s, holiday)
      out.jour += (special.length ? Math.max(...special.map(r => Number(r.kr))) : (jourRate || 0)) * hours
      out.jourHours += hours
    }
    else out.base += base * hours
    if (!isJour || emp.jour_ob) out.ob += obAt(emp, s, holiday) * hours
    out.hours += hours
    t = next
  }
  const pct = Number(emp.holiday_pay_pct) || 0
  out.holiday = (out.base + out.ob + out.jour) * pct / 100
  const gross = out.base + out.ob + out.jour + out.holiday
  if (!(gross > 0)) return null
  const taxRate = emp.tax_rate != null ? Number(emp.tax_rate) : 0.3
  const r = (x) => Math.round(x)
  return {
    gross: r(gross), net: r(gross * (1 - taxRate)), taxRate,
    breakdown: { base: r(out.base), ob: r(out.ob), jour: r(out.jour), holiday: r(out.holiday) },
    hours: Math.round(out.hours * 100) / 100, jourHours: Math.round(out.jourHours * 100) / 100,
  }
}

// Which employment a shift belongs to: its own link, else the default one.
export function employmentFor(shift, employments) {
  const list = (employments || []).filter(Boolean)
  return (shift?.employment_id && list.find(e => e.id === shift.employment_id))
    || list.find(e => e.is_default && e.active !== false)
    || list.find(e => e.active !== false) || null
}

// Calendar event title → employment (match_keywords, case-insensitive).
export function matchEmployment(title, employments) {
  const t = String(title || '').toLowerCase()
  if (!t) return null
  return (employments || []).find(e => e.active !== false
    && (e.match_keywords || []).some(k => k && t.includes(String(k).toLowerCase()))) || null
}

// Gross/net for a shift given all employments; falls back to the stored
// estimate for a shift that cannot be priced (e.g. no employment yet).
export function shiftPay(shift, employments) {
  const emp = employmentFor(shift, employments)
  const p = emp ? priceShift(shift, emp) : null
  if (p) return p
  const est = Number(shift?.estimated_pay) || 0
  return est ? { gross: est, net: Math.round(est * 0.7), taxRate: 0.3, breakdown: null, hours: Number(shift?.hours_worked) || 0, jourHours: 0 } : null
}

// Night shift = at least 3 h between 22:00 and 06:00 Stockholm time
// (the old "starts at 20:00 or later" test missed every 19:15/19:30 overnight).
export const NIGHT_MIN_HOURS = 3
export function nightHours(shift) {
  if (!shift?.start_time || !shift?.end_time) return 0
  const start = new Date(shift.start_time).getTime(), end = new Date(shift.end_time).getTime()
  let h = 0
  for (let t = start; t < end; ) {
    const next = Math.min(end, (Math.floor(t / SLICE_MS) + 1) * SLICE_MS)
    if (inWindow(stockholm(new Date(t)).minute, '22:00', '06:00')) h += (next - t) / 3600000
    t = next
  }
  return Math.round(h * 100) / 100
}
export const isNightShift = (shift) => nightHours(shift) >= NIGHT_MIN_HOURS
