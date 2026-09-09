import { format } from 'date-fns'
import { sv } from 'date-fns/locale'

// Salary period = the month-like window that runs from one payday to the day
// before the next payday. Shared by Ekonomi (period navigation) and Dashboard
// (PA-widget) so the two views can never disagree about which period "now" is
// in. See AUDIT.md P2-5.

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate()
// Payday can be the 29th–31st; clamp it to the real last day of short months
// so `new Date(y, 1, 31)` never silently rolls over into March.
const clampDay = (year, monthIndex, day) => Math.min(day, daysInMonth(year, monthIndex))

/**
 * @param {Date|string|number} referenceDate  any date inside the wanted period
 * @param {number} day  day of month the salary arrives (1–31)
 * @returns {{ start: string, end: string, label: string }}  ISO dates + sv label
 */
export function getSalaryPeriod(referenceDate, day) {
  const ref = new Date(referenceDate)
  const year = ref.getFullYear()
  const month = ref.getMonth() // 0-indexed
  const payDay = Math.min(Math.max(Number(day) || 25, 1), 31)

  // Before payday this month → the current period started last month.
  const startMonth = ref.getDate() < clampDay(year, month, payDay) ? month - 1 : month

  const periodStart = new Date(year, startMonth, clampDay(year, startMonth, payDay))
  const nextStart = new Date(year, startMonth + 1, clampDay(year, startMonth + 1, payDay))
  const periodEnd = new Date(nextStart)
  periodEnd.setDate(periodEnd.getDate() - 1)

  return {
    start: format(periodStart, 'yyyy-MM-dd'),
    end: format(periodEnd, 'yyyy-MM-dd'),
    label: `${format(periodStart, 'd MMM', { locale: sv })} – ${format(periodEnd, 'd MMM yyyy', { locale: sv })}`,
  }
}
