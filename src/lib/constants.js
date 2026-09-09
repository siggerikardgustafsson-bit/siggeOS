// Shared domain constants — single source of truth for vocabularies that
// several pages, components and the Jarvis edge function must agree on.
// Splitting these into per-file copies is how the "svenska vs engelska"
// class of silent-filter bugs got in (see AUDIT.md P0-1).

// trips.status — canonical English vocabulary. The DB stores exactly these
// ids; `create_trip` in jarvis-chat defaults to 'idea'.
export const TRIP_STATUSES = [
  { id: 'completed', label: 'Avklarad', color: '#10b981' },
  { id: 'planned',   label: 'Planerad', color: '#3b82f6' },
  { id: 'idea',      label: 'Idé',      color: '#8b5cf6' },
]
export const TRIP_STATUS_IDS = TRIP_STATUSES.map(s => s.id)
// Trips that haven't happened yet — used by Ekonomi (upcoming-trip budget)
// and Jarvis context.
export const TRIP_STATUSES_UPCOMING = ['planned', 'idea']
export const TRIP_STATUS_COLOR = Object.fromEntries(TRIP_STATUSES.map(s => [s.id, s.color]))
export const TRIP_STATUS_RANK = { completed: 3, planned: 2, idea: 1 }

// Default supplement list — shown before the user customises it. Was duplicated
// in Dashboard.jsx and Halsa.jsx (AUDIT.md P2-9).
export const DEFAULT_SUPPLEMENTS = ['Kreatin', 'D-vitamin', 'Omega-3', 'Multivitamin', 'Magnesium']
