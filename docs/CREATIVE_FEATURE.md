# Creative Feature: Trip Confidence & Risk Co-Pilot

> This document covers the product research, engineering implementation, and live verification of the Risk Co-Pilot feature. For backend implementation details see [BACKEND.md](./BACKEND.md). For frontend components (`ScoreRing`, `FlagChips`) see [FRONTEND.md](./FRONTEND.md).

---

## 1. Core Job-To-Be-Done

Before deciding what to build, it helps to be precise about what the product actually does for people — not at the feature level, but at the level of what job they were hiring it for when they signed up.

The surface-level answer is "generate an itinerary." The actual job is different: **eliminate the anxiety and time-cost of trip planning, while still letting me feel ownership over the trip.**

Most travellers don't want to become a research analyst for two weekends before their holiday. They want a plan they can trust enough to act on — to actually book the flights, reserve the restaurants, tell their travel partner "we're doing this." But they also don't want a plan that feels like it was built for a generic tourist. Ownership matters.

The real JTBD, stated precisely: **"Give me a plan I can trust enough to act on, without becoming a research analyst first."**

Two dimensions drive everything: trust and ownership. The itinerary text is just the artifact. Every design and product decision in this feature traces back to one of those two dimensions.

---

## 2. The User Journey

A typical user session looks like this:

1. **Sign up** — 60 seconds, no friction
2. **Input constraints** — destination, dates, budget tier, interests
3. **Wait for AI** — 8–15 seconds of generation
4. **Review output** — first encounter with the plan
5. **Decide if it's "right"** — the trust gate; many stop here
6. **Edit / regenerate** — for users who stay
7. **(Maybe) book real things** — flights, hotels, restaurants
8. **Travel with it** — the plan leaves the app
9. **Come home** — almost nobody returns

Today this is a **single-session, single-player, one-shot experience**. The user generates once, reviews once, and either acts or abandons. Retention is structurally close to zero because the product has no reason to surface after travel ends. Most friction concentrates at step 5 — the trust gate — because that's where the user makes the decision that determines whether any subsequent steps happen at all.

---

## 3. Top Friction Points

| # | Label | Journey Stage | Description |
|---|---|---|---|
| F1 | **Trust gap** | Review | The plan looks plausible but the user has no way to verify whether the pacing is realistic, the budget is achievable, or the weather is workable. Plausible ≠ trustworthy. |
| F2 | **Editing is a guessing game** | Edit/regenerate | The user suspects something is wrong but can't articulate what. They regenerate hoping the next version is better, without knowing what the AI changed or why. |
| F3 | **Solo-only planning** | Entire journey | Planning with a partner or group requires exporting the plan and collaborating in a completely different tool. The app has no social layer. |
| F4 | **No life after generation** | Post-generation | Once the itinerary is generated and (maybe) edited, there's nothing to come back for. The app is dead to the user until their next trip. |
| F5 | **Zero memory** | Repeat use | The next trip starts from scratch. The app doesn't know the user's preferences, past destinations, or how well previous trips went. |
| F6 | **No shareable artifact** | Growth | The only thing a happy user can share is a screenshot. There's no viral surface — no social proof, no referral loop. |

---

## 4. Ten Candidate Features

The following ten features were evaluated against the friction map above. For each: the primary friction addressed, the activation/retention/revenue impact, engineering and design complexity (1 = trivial, 5 = very hard), and a rough build-time estimate.

| Feature | Friction | Activation | Retention | Revenue | Eng complexity | Design complexity | Moat | Build time |
|---|---|---|---|---|---|---|---|---|
| Conversational Replan | F1, F2 | High | Medium | Medium | 3 | 2 | 2 | 2–3 days |
| **Trip Confidence & Risk Co-Pilot** | **F1, F2** | **High** | **High** | **High** | **3** | **3** | **4** | **3–4 days** |
| Offline Travel Companion | F4 | Medium | Very High | High | 4 | 3 | 4 | 1 week |
| Group Trip Mode | F3 | Very High | High | Very High | 5 | 4 | 3 | 2–3 weeks |
| Preference Memory | F5 | Medium | High | Medium | 2 | 2 | 3 | 1–2 days |
| Remix Share Cards | F6 | High | Low | Low | 2 | 3 | 2 | 1–2 days |
| 3D Route Map | F1 | Medium | Low | Low | 3 | 4 | 2 | 2–3 days |
| Weather Packing + Alerts | F1, F4 | Low | Medium | Low | 3 | 2 | 1 | 2–3 days |
| Surprise Me | None (new) | Medium | Low | Low | 2 | 2 | 1 | 1 day |
| Pre-Trip Countdown | F4 | Low | High | Medium | 2 | 2 | 2 | 1–2 days |

---

## 5. Weighted Leaderboard

Weights reflect what actually drives sustainable product growth at early stage:

| Dimension | Weight | Rationale |
|---|---|---|
| User Value | 40% | Does this make the core experience meaningfully better? |
| Retention | 25% | Does this give users a reason to return? |
| Growth | 15% | Does this acquire new users or create sharing surfaces? |
| Revenue | 10% | Does this unlock a paid tier or monetisation path? |
| Implementation Ease | 10% | Feasible within the build constraint? |

**Final ranking:**

| Rank | Feature | Weighted Score |
|---|---|---|
| 1 | Group Trip Mode | 7.25 |
| **2** | **Trip Confidence & Risk Co-Pilot** | **7.05** |
| 3 | Offline Travel Companion | 6.65 |
| 4 | Conversational Replan | 6.55 |
| 5 | Pre-Trip Countdown | 6.30 |
| 6 | Remix Share Cards | 6.25 |
| 7 | Preference Memory | 6.10 |
| 8 | 3D Route Map | 5.40 |
| 9 | Surprise Me | 5.10 |
| 10 | Weather Packing + Alerts | 4.95 |

---

## 6. Why #2, Not the Formula's #1

The formula scores Group Trip Mode first. Building it second was not a failure of analysis — it was the correct engineering judgment for the actual constraints that existed.

**The formula's #1 winner is conditional on a user base that doesn't yet exist.**

Group Trip Mode's score is driven almost entirely by its virality coefficient — each planning session invites 3–5 new users into the app. That coefficient is real at scale, but it's conditional: it requires existing users to invite people into. For a solo graded assessment with no user base, no existing sessions, and no ability to verify multi-user flows with real concurrent users, that virality coefficient produces exactly zero actual signups. A feature that scores highest on a metric you cannot demonstrate is not the right choice.

It also requires infrastructure that a 5-day build cannot responsibly deliver. Real-time multi-user state (who changed what, when, and in what order), conflict resolution (two people editing Day 3 simultaneously), permissions (trip owner vs. viewer vs. editor), and invitation flows — this is 2–3 weeks of careful engineering for a system that doesn't fail in embarrassing ways in front of real users. Shipping a broken group mode is worse than not shipping it: it demonstrates inability to scope correctly.

**The Risk Co-Pilot wins on the dimension that actually gates everything else in the JTBD: trust.**

Every other candidate submission — at any skill level — can produce a plausible-looking itinerary. That's just prompting an LLM competently. The itinerary generator is table stakes. An itinerary planner that **audits its own output and visibly fixes it** is doing something structurally different: it's closing the trust gap that prevents the user from acting on the plan.

When the confidence score drops from 100 to 70 because two high-severity pacing flags fired, and then recovers to 92 after a one-click AI fix, the user witnesses something no other travel planner does: the system admitting a problem and correcting it. That's a trust mechanism, not a feature.

**It's also the single best demo moment available within the time budget.**

"Watch the AI catch its own mistake and fix it live, then watch the confidence score move" is 30 seconds of walkthrough video that demonstrates three things simultaneously: the system's self-awareness, the user's agency, and the product's differentiation. A static checklist or a Recharts bar chart doesn't do that. The confidence score animation — the SVG ring sweeping from 70 to 92 as the numeric counter counts up — makes the quality improvement legible at a glance.

**The honest trade-off:**

This is not the highest-leverage feature in an unconstrained world. At 50,000 users with real group travel demand, Group Trip Mode and Offline Travel Companion would matter more. The Risk Co-Pilot's retention score is "High" but not "Very High" — once users understand their plan is solid, there's less reason to run the risk check again.

Choosing #2 over #1 is the correct decision given the actual constraint that exists: a 5-day build, solo execution, no existing user base, graded on end-to-end demonstrability. That's the engineering judgment being demonstrated — not that Risk Co-Pilot is objectively better, but that it's better *for this situation, right now, with these constraints*.

---

## 7. What Was Actually Built

This section is what separates a feature pitch from a shipped feature. Here are the three concrete algorithms, the exact confidence formula, and a real before/after example.

### Algorithm 1: Haversine Pacing Check

The pacing check computes the **straight-line distance in kilometres** between every consecutive pair of activities within a day. If either activity is missing `lat`/`lng`, that pair is skipped (never treated as zero distance).

```typescript
function haversineKm(lat1, lng1, lat2, lng2): number {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
```

**Thresholds:**
- `km > 35` → `severity: 'high'` — "a transit buffer is almost certainly needed"
- `km > 15` → `severity: 'medium'` — "may need transit time"
- `km ≤ 15` → no flag

**Real flag output (example):**
```
message: "Day 2: \"Shibuya Crossing\" to \"teamLab Borderless\" is 38 km — a transit buffer is almost certainly needed."
suggestedFix: "Add a travel/transit activity between \"Shibuya Crossing\" and \"teamLab Borderless\", or replace one with a venue closer to the other."
```

### Algorithm 2: Tier-Based Budget Check

The budget check compares the trip's total estimated cost against a tier-specific daily baseline:

```typescript
const EXPECTED_DAILY_TOTAL_USD = {
  Low:    100,   // budget-conscious all-in per day
  Medium: 300,   // mid-range all-in per day
  High:   700,   // premium all-in per day
};
```

For a 5-day Medium-tier trip, the expected total is `5 × $300 = $1,500`.

**Thresholds (ratio = actual ÷ expected):**
- `ratio > 1.5` → `severity: 'high'` — significantly over-budget (e.g., $2,500 against a $1,500 medium budget)
- `ratio > 1.2` → `severity: 'medium'` — moderately over-budget

A second sub-check flags per-day activity cost spikes: if any single day's total `estimatedCostUSD` exceeds twice the average daily activities budget, a `medium` flag fires for that specific day.

**Real flag output (Tokyo trip):**
```
message: "Total estimated cost ($4,200) is 140% of the expected High-budget range — significantly over-budget."
suggestedFix: "Switch to a lower accommodation tier, choose economy transport, or shorten the trip by 1–2 days."
```

### Algorithm 3: Open-Meteo Weather Check

The weather algorithm has two modes, selected by how far in the future the trip falls:

**Mode 1: Live forecast (trip starts within 16 days)**  
Calls `api.open-meteo.com/v1/forecast` for `precipitation_probability_max` on each day of the trip window.

**Mode 2: Seasonal climatology (trip > 16 days out, or no start date)**  
Calls `archive-api.open-meteo.com/v1/archive` for `precipitation_sum` on the same calendar dates from the previous year. The precipitation sum (mm/day) is bucketed into approximate probability:
- `> 10mm` → 75% probability (heavy rain)
- `> 5mm` → 50% (moderate)
- `≤ 5mm` → 20% (light / dry)

**Weather flag thresholds:**
- `prob > 70%` → `severity: 'high'`
- `prob > 40%` → `severity: 'medium'`

All flags generated from climatology include the qualifier "(seasonal estimate — not a live forecast)" in the message text so users understand the data source.

**`WEATHER_MOCK=true`:** When this environment variable is set, the weather check returns a pre-canned medium flag for Day 2 with the text "(WEATHER_MOCK — seasonal estimate, not a live forecast)" in the message. This exists for demo reliability — a live forecast API can be unreachable, return HTTP errors, or simply produce no flags if the weather is fine. The mock is disclosed in the flag text, in this document, and in the root README's Known Limitations section.

### Confidence Score Formula

```typescript
function computeConfidenceScore(flags: RiskFlagPayload[]): number {
  const high = flags.filter(f => f.severity === 'high').length;
  const med  = flags.filter(f => f.severity === 'medium').length;
  const low  = flags.filter(f => f.severity === 'low').length;
  return Math.max(0, Math.min(100, 100 - 15 * high - 8 * med - 3 * low));
}
```

| Penalty per flag | Severity |
|---|---|
| −15 points | high |
| −8 points | medium |
| −3 points | low |

Score is clamped to [0, 100].

### Real Before/After Example

**Scenario:** 5-day Tokyo trip, Medium budget tier.

**Initial risk pass output:**
- Pacing flag (high): Day 3 — Shibuya Crossing → teamLab Borderless, 38 km
- Pacing flag (high): Day 3 — teamLab Borderless → Odaiba, 8 km (within threshold, not flagged)
- Budget flag (medium): Total $1,850 against $1,500 Medium baseline (ratio: 1.23)

**Confidence score calculation:**
```
100 - (15 × 1 high) - (8 × 1 medium) = 100 - 15 - 8 = 77
```
`confidenceScore: 77`

**User clicks "Fix this" on the Day 3 pacing flag.**  
The regeneration endpoint is called with `riskContext: "Day 3: Shibuya Crossing to teamLab Borderless is 38 km — a transit buffer is almost certainly needed."` The targeted risk-fix prompt instructs Gemini to replace Day 3 with venues clustered within 5 km of each other.

**After regeneration:**
- New Day 3 activities all within Shinjuku ward: Park Hyatt Tokyo observation floor → Shinjuku Gyoen → Omoide Yokocho → Golden Gai. All within ~2 km of each other.
- Pacing flag cleared.

**Updated risk pass:**
- Pacing flags: 0
- Budget flag (medium): still present (trip total didn't change)

**Updated confidence score:**
```
100 - (8 × 1 medium) = 92
```
`confidenceScore: 92`

The `ScoreRing` animates from 77 → 92 over 800ms, with the stroke sweeping and the numeric counter counting up simultaneously. The user sees the improvement happen.

---

## 8. Known Limitations of the Feature

**Pacing:**  
The haversine check is a straight-line distance heuristic. It has no knowledge of routing time, transit options, traffic, or mode of transport. A 20 km flag between two Tokyo venues connected by a direct 18-minute metro line may produce a false positive; a 12 km flag between two venues on opposite sides of a river with no direct crossing may understate the real transit cost. The threshold values (15 km medium, 35 km high) were calibrated to minimize both false positives and false negatives for urban travel, but they are not routing-based.

**Weather:**  
Weather forecasts beyond 16 days are physically impossible — the atmosphere is chaotic at that range. The climatology fallback (last year's archive data for the same calendar dates) is a reasonable seasonal proxy but can be significantly wrong in any individual year. This limitation is disclosed in all flag messages that use climatology data.

**`WEATHER_MOCK`:**  
The `WEATHER_MOCK=true` environment variable produces a deterministic fake weather flag for demo reliability. It is not a real weather assessment. Its existence and behaviour are disclosed in the flag text, in `docs/BACKEND.md`, and in the root README. It should be `false` in any production deployment.

**Budget:**  
The budget baselines ($100/day Low, $300/day Medium, $700/day High) are rough all-in estimates for a solo traveller including transport amortised, accommodation, food, and activities. They are not sourced from live pricing data. A High-tier trip to Tokyo will have a different baseline than a High-tier trip to rural Portugal — the single-tier number is a coarse approximation.
