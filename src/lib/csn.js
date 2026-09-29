// ============================================================================
// CSN fribelopp — what counts, and how much.
// ----------------------------------------------------------------------------
// The fribelopp is about taxable income BEFORE tax (lön). Bank-synced income
// arrives NET and mixed with money that is not income at all (the CSN payout
// itself, Swish from friends, cash deposits). Until 2026-09-29 every synced
// credit counted, so the page showed ~80% used when the real figure was far
// lower. Rules:
//   - source 'Lön' = net salary from the bank → grossed up (÷ (1 − TAX_RATE))
//   - source 'PA-jobb' = logged gross → as is
//   - everything else only if the row is explicitly flagged counts_toward_csn
// TAX_RATE matches Ekonomi's 30% assumption; for a student's salary the real
// rate is usually lower, so the gross estimate errs on the SAFE side (higher).
// ============================================================================

export const CSN_TAX_RATE = 0.30
export const NET_SALARY_SOURCES = ['Lön']

export function fribeloppAmount(row) {
  if (!row?.counts_toward_csn) return 0
  const amt = Number(row.amount) || 0
  return NET_SALARY_SOURCES.includes(row.source) ? amt / (1 - CSN_TAX_RATE) : amt
}

// Bank-synced income → { source, counts_toward_csn }. Mirrors
// supabase/functions/ekonomi-sync (classifyIncome) — keep the two in sync.
export function classifyBankIncome(description) {
  const d = (description || '').toLowerCase()
  if (/(^|[\s/])lön($|[\s/])/.test(d)) return { source: 'Lön', counts_toward_csn: true }
  if (/(^|[\s/])csn($|[\s/])/.test(d)) return { source: 'CSN', counts_toward_csn: false }
  if (/skatteverket|skatteåterb|(^|\s)skv(\s|$)/.test(d)) return { source: 'Skatteåterbäring', counts_toward_csn: false }
  return { source: 'Övrigt', counts_toward_csn: false } // Swish (+46…), CDM cash deposits, refunds
}
