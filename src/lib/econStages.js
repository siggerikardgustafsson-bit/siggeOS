// Life-stage multipliers for the economy tier metrics. Shared by the tier
// engine (the tier it assigns) and the benchmark datasets (the percentile it
// shows next to that tier) so the two can never drift (AUDIT.md P2-10).
//
// A value < 1 lowers the threshold for that life stage (e.g. a student is
// scored against a gentler income bar).
export const ECON_LIFE_STAGE = {
  income:    { student: 0.35, early_career: 0.70, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 0.50 },
  savings:   { student: 0.30, early_career: 0.60, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 1.30 },
  net_worth: { student: 0.20, early_career: 0.50, professional: 1.0, entrepreneur: 1.1, parent: 1.00, retired: 1.50 },
}
