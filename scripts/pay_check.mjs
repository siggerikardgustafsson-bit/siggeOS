// Pay engine verification — run: npx esbuild scripts/pay_check.mjs --bundle --platform=node --format=esm --outfile=/tmp/p.mjs && TZ=UTC node /tmp/p.mjs
// TZ=UTC on purpose: the engine must price in Stockholm time even on a UTC server.
import { priceShift, isStorhelg, matchEmployment, employmentFor, isNightShift, nightHours } from '../src/lib/pay.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// The seeded model = the old hardcoded Jobb.jsx model.
const HUMANA = {
  id: 'h', kind: 'hourly', hourly_rate: 149, ob_mode: 'sum', jour_rate: 41.08, jour_from: '22:00', jour_to: '06:00', jour_ob: true,
  holiday_pay_pct: 0, tax_rate: 0.3, is_default: true, match_keywords: ['assistanstid', 'hos hw'],
  ob_rules: [
    { label: 'OB kväll', kr: 25.87, days: [0, 1, 2, 3, 4, 5, 6], from: '18:00', to: '22:00' },
    { label: 'OB natt', kr: 52.41, days: [0, 1, 2, 3, 4, 5, 6], from: '22:00', to: '06:00' },
    { label: 'OB helg', kr: 64.64, days: [0, 6], from: '00:00', to: '24:00' },
    { label: 'OB storhelg', kr: 129.39, holiday: true, exclusive: true, from: '00:00', to: '24:00' },
  ],
}
// Old algorithm, hour by hour (Stockholm hours given explicitly).
function oldPay(hours, { sov, weekendFrom = 99, holidayFrom = 99 }) {
  let t = 0
  hours.forEach((h, i) => {
    const natt = h >= 22 || h < 6, kvall = h >= 18 && h < 22
    const storhelg = i >= holidayFrom, helg = i >= weekendFrom
    const rate = sov && natt ? 41.08 : 149
    let ob = storhelg ? 129.39 : helg ? 64.64 : 0
    if (natt && !storhelg) ob += 52.41; else if (kvall && !storhelg) ob += 25.87
    t += rate + ob
  })
  return Math.round(t)
}
const range = (a, n) => Array.from({ length: n }, (_, i) => (a + i) % 24)

// Tue 2026-09-29 22:00 → Wed 07:00 Stockholm (CEST, UTC+2), sovpass
const sov = priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-30T05:00:00Z', shift_type: 'sov' }, HUMANA)
ok('weekday sovpass = old model', sov.gross === oldPay(range(22, 9), { sov: true }), `${sov.gross} vs ${oldPay(range(22, 9), { sov: true })}`)
ok('jour hours 8 of 9', sov.jourHours === 8, String(sov.jourHours))

// Same as vaken
const vak = priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-30T05:00:00Z', shift_type: 'vaken' }, HUMANA)
ok('weekday vaken = old model', vak.gross === oldPay(range(22, 9), { sov: false }), `${vak.gross}`)

// Fri 2026-10-02 16:00 → Sat 08:00 (weekend starts at 00:00 = index 8)
const fri = priceShift({ start_time: '2026-10-02T14:00:00Z', end_time: '2026-10-03T06:00:00Z', shift_type: 'vaken' }, HUMANA)
ok('fri→sat vaken = old model', fri.gross === oldPay(range(16, 16), { sov: false, weekendFrom: 8 }), `${fri.gross} vs ${oldPay(range(16, 16), { sov: false, weekendFrom: 8 })}`)

// Julafton 2026-12-24 is Thursday; 12:00–20:00 CET (UTC+1) → storhelg exclusive
const jul = priceShift({ start_time: '2026-12-24T11:00:00Z', end_time: '2026-12-24T19:00:00Z', shift_type: 'vaken' }, HUMANA)
ok('julafton = old model', jul.gross === oldPay(range(12, 8), { sov: false, holidayFrom: 0 }), `${jul.gross}`)

// Holidays: långfredag 2027 = 03-26, midsommarafton 2026 = 06-19
ok('långfredag 2027', isStorhelg(new Date('2027-03-26T10:00:00Z')))
ok('midsommarafton 2026', isStorhelg(new Date('2026-06-19T10:00:00Z')))
ok('ordinary day not holiday', !isStorhelg(new Date('2026-09-29T10:00:00Z')))

// DST end night (2026-10-25 03:00 CEST → 02:00 CET): 22:00→06:00 is 9 real hours
const dst = priceShift({ start_time: '2026-10-24T20:00:00Z', end_time: '2026-10-25T05:00:00Z', shift_type: 'vaken' }, HUMANA)
ok('DST night counts real hours', dst.hours === 9, String(dst.hours))

// ob_mode highest + semesterersättning + tax
const hi = priceShift({ start_time: '2026-10-03T20:00:00Z', end_time: '2026-10-03T21:00:00Z', shift_type: 'vaken' },
  { ...HUMANA, ob_mode: 'highest', holiday_pay_pct: 12, tax_rate: 0.25 })
// Sat 22:00-23:00: highest(natt 52.41, helg 64.64) = 64.64 → (149+64.64)*1.12
ok('highest mode + 12% semester', hi.gross === Math.round((149 + 64.64) * 1.12), String(hi.gross))
ok('net uses tax_rate', hi.net === Math.round(hi.gross * 0.75), String(hi.net))

// jour_ob false: jour hours get no OB
const noOb = priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-29T21:00:00Z', shift_type: 'sov' }, { ...HUMANA, jour_ob: false })
ok('jour without OB', noOb.gross === 41, String(noOb.gross))

// Monthly job and bad input → null
ok('monthly → null', priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-29T21:00:00Z' }, { kind: 'monthly' }) === null)
ok('end before start → null', priceShift({ start_time: '2026-09-29T21:00:00Z', end_time: '2026-09-29T20:00:00Z' }, HUMANA) === null)

// Matching
const other = { id: 'o', active: true, match_keywords: ['café'] }
ok('keyword match', matchEmployment('Assistanstid hos HW', [other, HUMANA])?.id === 'h')
ok('no match → null', matchEmployment('Tandläkare', [other, HUMANA]) === null)
ok('employmentFor falls back to default', employmentFor({ employment_id: null }, [other, HUMANA])?.id === 'h')
ok('employmentFor honours link', employmentFor({ employment_id: 'o' }, [other, HUMANA])?.id === 'o')

// Night shifts
ok('19:30→08:00 is a night shift', isNightShift({ start_time: '2026-09-28T17:30:00Z', end_time: '2026-09-29T06:00:00Z' }))
ok('night hours 8', nightHours({ start_time: '2026-09-28T17:30:00Z', end_time: '2026-09-29T06:00:00Z' }) === 8)
ok('10:00→15:00 is not', !isNightShift({ start_time: '2026-09-26T08:00:00Z', end_time: '2026-09-26T13:00:00Z' }))
ok('18:00→23:00 (1 h night) is not', !isNightShift({ start_time: '2026-09-26T16:00:00Z', end_time: '2026-09-26T21:00:00Z' }))

console.log(`\n${pass}/${pass + fail} pass`)
if (fail) process.exit(1)
