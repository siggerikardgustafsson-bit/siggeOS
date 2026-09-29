// ============================================================================
// Profile summary — the condensed "Om mig" Jarvis gets in every request.
// ----------------------------------------------------------------------------
// user_settings.about_me is the user's own, unabridged text (it can run to
// ~40k characters ≈ 18k tokens — over half the cost of every Jarvis call).
// The summary keeps the substance that changes how a coach acts and drops
// repetition; the full text stays available to Jarvis via fetch_memory_goals.
// Regenerated when about_me is saved with changes; editable in Settings.
// ============================================================================

export const PROFILE_SUMMARY_SYSTEM = `Du komprimerar en persons egen självbeskrivning till den profil som hens personliga AI-coach läser inför VARJE samtal. Coachen har tillgång till originaltexten vid behov, men det här är vad den alltid bär med sig – så allt som ändrar hur en coach borde agera måste finnas kvar.

BEHÅLL (konkret, med siffror, namn och tidpunkter där de finns):
- vem personen är: ålder, bakgrund, utbildning, jobb, livssituation, var hen bor
- nuläge och baseline-siffror
- mål på kort och lång sikt, och varför de betyder något
- hälsa och kropp, inklusive mediciner, substanser, sömn och diagnoser/utmaningar
- träning, studier, ekonomi, projekt och entreprenörskap
- relationer och viktiga personer
- återkommande mönster, triggers, svagheter och det som brukar spåra ur
- styrkor, prestationer, drivkrafter och värderingar
- vad som fungerar och inte fungerar för just den här personen
- hur personen vill bli bemött och coachad

TA BORT: upprepningar, utfyllnad, retorik och exempel som bara illustrerar något redan sagt.
Behåll personens egna formuleringar där de bär mening. Skriv i jag-form, som originalet.

FORMAT: korta rubriker (Vem jag är · Nuläge · Mål · Hälsa & kropp · Träning · Studier & jobb · Ekonomi · Relationer · Mönster & svagheter · Styrkor & drivkrafter · Hur jag vill bli coachad) med täta punktlistor. Utelämna en rubrik som saknar innehåll. Högst cirka 4500 tecken. Ingen inledning, ingen avslutning – bara profilen.`

export async function generateProfileSummary(supabase, aboutMe) {
  const text = (aboutMe || '').trim()
  if (!text) return ''
  const { data, error } = await supabase.functions.invoke('jarvis-chat', {
    body: {
      messages: [{ role: 'user', content: `Självbeskrivning (${text.length} tecken):\n\n${text}` }],
      context: '',
      systemPrompt: PROFILE_SUMMARY_SYSTEM,
      feature: 'profile_summary',
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data?.content || '').trim()
}

// Short texts go to Jarvis as-is — no point summarising 2 000 characters.
export const SUMMARY_THRESHOLD = 6000
