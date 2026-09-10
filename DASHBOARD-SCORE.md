# Dashboard & Maxx Score — genomgång + åtgärder

**Datum:** 2026-09-10
**Uppdrag:** Dashboard som verklig helhetsbild + åtgärda produktmässiga återvändsgränder.

## Kursändring under passet

Ursprungsfrågan var om Dashboard borde bli en "life-OS-cockpit" med morgonbriefing
(dagens schema + proaktiva signaler synligt direkt vid laddning). **Ditt svar:**
*"ändra inte detta, det ändrar syftet med dashboarden — förbättra score-systemet
eller tydligheten istället."* Så FAS 2 blev score-systemet, inte en ny briefing.

Det jag hade hittat i FAS 1 och som du medvetet **inte** vill ändra:
`TodayWidget` (dagens schema) och `detectSignals` (sömnunderskott / träningsuppehåll /
tenta-beredskap / loggluckor) finns byggda men syns bara på hover i ett hörn eller
på Insights. Det är ett medvetet val, inte en återvändsgränd — noterat, orört.

---

## Byggt (4 commits, pushade till main)

| Commit | Vad | Typ |
|---|---|---|
| `b44f53e` | **Sömn-tier: dubbletten 8.5h borttagen.** `SLEEP_DURATION_THRESHOLDS` var `[6.5,7,7.5,8,8.5,8.5,9]` — 8.5 stod på både T6 och T7, så **T6 gick inte att nå** och 8.5h snittsömn hoppade rakt från T5 till T7. Nu `[6.5,7,7.25,7.5,8,8.5,9]` (ditt val av de två alternativen). | Räknebugg |
| `cbaf2e5` | **Kravtexten för sömn-tiers uppdaterad** i DetailModal + CategoryCard så "lås upp nästa tier"-texterna stämmer med den nya trappan (stod tidigare "≥ 7.5h" för T4, "≥ 8.5h" för både T6 och T7). | Följdfix |
| `9e13086` | **`getTier()` läser den kanoniska paletten.** Funktionen bar egna inline-arrayer för `labels` och `colors`. Etiketterna matchade `TIER_NAMES`, men färgerna hade glidit: getTier T4 = `#f59e0b` (bärnsten) medan `TIER_COLORS[4]` = `#fbbf24` (gul); T2 `#3b82f6` vs `#4f8ef7`; osv. Följd: hälso-submåttens tier-chips (energi/humör/alkohol/kosttillskott) och sömn/energi-historikgrafen ritades i en annan palett än varje kategoriprick. Nu härleds allt från `TIER_NAMES`/`TIER_COLORS`. **Tier-matte och etiketter oförändrade — bara hex-värdena linjerar.** Sista av P2-9:s glidande palettkopior. | Tydlighet / konsistens |
| `776b32f` | **Maxx Score: rubriksiffran förklaras.** Kärnsiffran är `round(0.55·vägd-tier + 0.45·svagaste-länk)` (från `computeMaxxScoreV2`) — men det stod ingenstans. Klick på Maxx-bubblan har nu ett avsnitt **"Så räknas Maxx Score ut"**: vägt snitt av kategorierna (+ percentil), svagaste kategori (som blandningen viktar tyngst), 55/45-blandningen → rubrik-tier, och **"Baserad på N av 6 kategorier"** som namnger varje livsområde utan data — så en delvis siffra aldrig ser ut som en komplett. `buildMaxxProfile` fick ett `composition`-objekt; DetailModal renderar det bara för maxx-kortet. **Ingen scoring-ändring.** | Tydlighet |

**Verifiering:** `npm run build` grön efter varje ändring (körd 3 ggr totalt).
Visuell kontroll i preview blev avbruten — inloggningssessionen i den inbyggda
webbläsaren hade hunnit gå ut och jag kan inte logga in åt dig. Ändringarna är
konservativa (en datakonstant, en mekanisk palett-swap med identisk matte, ett
additivt objekt + ett villkorat renderblock) och bygget är grönt, men **kolla
gärna själv** att "Så räknas Maxx Score ut" ser bra ut när du klickar Maxx-bubblan.

---

## Väntar på beslut

| Fråga | Läge |
|---|---|
| **Sömn-tröskeln** — vilken av två trappor. | **Besvarad:** `[6.5,7,7.25,7.5,8,8.5,9]`. Byggt. |
| **`getSkillTier` / `getStudyTier` egna paletter.** Samma glidning som `getTier` hade, MEN här är de avvikande etiketterna avsiktliga (Expert/Avancerad/Nybörjare, Mästare/Seriös/Dedikerad — inte percentil-etiketter). Färgerna kan linjeras till `TIER_COLORS[tier]` utan att röra etiketterna, så en T5-färdighet blir grön som allt annat T5. Är den avvikande färgen en del av vokabulären, eller en miss? | **Öppen.** Rör inte förrän du säger till. |
| **Percentil-framställningen.** `TIER_PCT = [0,25,50,70,80,90,95,97.5,99]` mappar T1→25:e, T2→50:e … Detta visas för dig som "percentil 78" / "Topp 20%" med mer precision än modellen bär (trösklarna är egna, ingen extern norm för de flesta). Antingen tona ner språket ("ungefär topp 20%") eller acceptera att det är en intern skala. Ändrar hur varje siffra läses → ditt beslut. | **Öppen.** |

---

## Identifierat men inte byggt

*(Score-systemets kärna men inte akut — nästa session eller efter beslut ovan.)*

- **Två overall-modeller.** `overallTier` = `maxx.tier.tier || calcOverallTier(...)`.
  `computeMaxxScoreV2` är 55/45-blandningen; `calcOverallTier` är rakt medelvärde,
  avrundat. Fallbacken triggar bara när maxx är `null` (inga rankbara kategorier) —
  ofarligt, men två definitioner av "din overall-tier". Kan tas bort och ersättas
  med "—" när maxx inte kan räknas.
- **Progressbarens betydelse.** Constellation-ringarna använder `levelUp.progressPct`
  (väg till nästa tier) konsekvent. `c.pct` på kategoriobjektet är däremot
  inkonsekvent definierad per kategori (tier/8 för de flesta, väg-till-nästa för
  styrka, mastery-% för plugg) — den läses numera bara som fallback i KpiTree, så
  inte användarsynligt, men latent skört.
- **Död kod i scoring-libbet.** `estimateVO2max`, `SLEEP_REGULARITY_THRESHOLDS`,
  `STRESS_THRESHOLDS`, `calc1RM` exporteras men används ingenstans. Liten städning.
- **Domäner utan plats på Dashboard** (Jobb-projekt, resor, fristående mål) — hör
  till den briefing-idé du avvisade. Lämnas.

---

## Känns Dashboard som en verklig helhetsbild nu?

Inom det du valde: **tydligare, ja.** Rubriksiffran är inte längre en svart låda —
du kan se att den är en blandning av vägt snitt och svagaste länk, vilken kategori
som drar ner, och om något livsområde saknar data. Sömn-tiern räknas rätt. Färgerna
är samma överallt.

Vad som fortfarande saknas för "helhetsbild" i vidare mening: Dashboard visar var du
**rankar**, inte vad som **pågår** — men det är enligt din uttryckliga vilja. Om du
någon gång vill ha "vad ska jag göra idag" utan att öppna 5 sidor finns motorerna
(`TodayWidget`, `detectSignals`, `crossDomainFindings`) redan — de är bara inte på
Dashboard. Säg till om det ändrar sig.
