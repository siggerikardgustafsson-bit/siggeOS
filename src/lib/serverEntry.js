// Entry point for the server bundle (scripts/bundle-tier-compute.mjs →
// supabase/functions/_shared/serverLib.bundle.js). Everything exported here
// must be runtime-agnostic: no ./supabase import, no React, no DOM.
export { fetchTierInputs, computeTierCategories, tierSnapshotRow } from './tierCompute'
export { buildJarvisNowContext } from './jarvis/nowContext'
