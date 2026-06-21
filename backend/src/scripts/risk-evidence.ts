/**
 * risk-evidence.ts — runs the risk pass against manufactured scenarios
 * and prints real JSON output for each verification point.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json src/scripts/risk-evidence.ts
 * or:
 *   WEATHER_MOCK=true npx ts-node --project tsconfig.json src/scripts/risk-evidence.ts
 */

import { runRiskPass, type TripInput } from '../services/risk.service';

// ─── Helper ────────────────────────────────────────────────────────────────────
function section(title: string) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

async function main() {
  // ─── Scenario 1: PACING — two activities >35 km apart (Tokyo → Mt Fuji) ────
  section('SCENARIO 1 — PACING RISK (wide-spread same-day activities)');

  const pacingTrip: TripInput = {
    destination: 'Tokyo, Japan',
    durationDays: 1,
    budgetTier: 'Medium',
    startDate: null,
    destinationLat: 35.6762,
    destinationLng: 139.6503,
    itinerary: [
      {
        dayNumber: 1,
        activities: [
          // Shinjuku station — start of day
          { title: 'Shinjuku Gyoen National Garden', estimatedCostUSD: 10, lat: 35.6851, lng: 139.7100 },
          // Mt Fuji 5th Station — ~100 km away — should fire HIGH pacing
          { title: 'Mt Fuji 5th Station', estimatedCostUSD: 20, lat: 35.3731, lng: 138.7314 },
          // Back in Tokyo — ~100 km again — should fire ANOTHER HIGH
          { title: 'Senso-ji Temple, Asakusa', estimatedCostUSD: 0, lat: 35.7148, lng: 139.7967 },
        ],
      },
    ],
    estimatedBudget: null,
  };

  const pacing = await runRiskPass(pacingTrip);
  console.log('\nriskFlags:');
  console.log(JSON.stringify(pacing.riskFlags, null, 2));
  console.log(`\nconfidenceScore: ${pacing.confidenceScore}`);

  // ─── Scenario 2: PACING with MISSING lat/lng (should log + skip) ────────────
  section('SCENARIO 2 — MISSING LAT/LNG (should log skip and not crash)');

  const missingCoordTrip: TripInput = {
    destination: 'Paris, France',
    durationDays: 1,
    budgetTier: 'Medium',
    startDate: null,
    destinationLat: 48.8566,
    destinationLng: 2.3522,
    itinerary: [
      {
        dayNumber: 1,
        activities: [
          { title: 'Eiffel Tower', estimatedCostUSD: 30, lat: 48.8584, lng: 2.2945 },
          // Missing coordinates — should be logged and skipped
          { title: 'Some Uncoded Venue', estimatedCostUSD: 15, lat: undefined, lng: undefined },
          { title: 'Louvre Museum', estimatedCostUSD: 17, lat: 48.8606, lng: 2.3376 },
        ],
      },
    ],
    estimatedBudget: null,
  };

  // Capture the console.log output by monkey-patching
  const skipLogs: string[] = [];
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (line.includes('skipping')) skipLogs.push(line);
    origLog(...args);
  };

  const missing = await runRiskPass(missingCoordTrip);
  console.log = origLog;

  console.log('\n[Risk/Pacing] skip log lines captured:');
  if (skipLogs.length) {
    skipLogs.forEach(l => console.log('  ' + l));
  } else {
    console.log('  (none — no pairs with missing coords produced a skip log)');
  }
  console.log('\nriskFlags:', JSON.stringify(missing.riskFlags, null, 2));
  console.log(`confidenceScore: ${missing.confidenceScore}`);

  // ─── Scenario 3: BUDGET RISK — Low-tier with expensive activities ─────────
  section('SCENARIO 3 — BUDGET RISK (Low budget, expensive activities)');

  const budgetTrip: TripInput = {
    destination: 'London, UK',
    durationDays: 3,
    budgetTier: 'Low',       // expected: $100/day → $300 total
    startDate: null,
    destinationLat: 51.5074,
    destinationLng: -0.1278,
    itinerary: [
      {
        dayNumber: 1,
        activities: [
          { title: 'The Ritz Afternoon Tea', estimatedCostUSD: 280, lat: 51.5069, lng: -0.1420 },
          { title: 'West End Show Premium Seats', estimatedCostUSD: 220, lat: 51.5130, lng: -0.1282 },
        ],
      },
      {
        dayNumber: 2,
        activities: [
          { title: 'Tower of London Tour', estimatedCostUSD: 35, lat: 51.5081, lng: -0.0759 },
          { title: 'Borough Market lunch', estimatedCostUSD: 20, lat: 51.5054, lng: -0.0914 },
        ],
      },
      {
        dayNumber: 3,
        activities: [
          { title: 'Hyde Park', estimatedCostUSD: 0, lat: 51.5073, lng: -0.1657 },
        ],
      },
    ],
    estimatedBudget: {
      transport: 90,
      accommodation: 210,   // 3 nights × $70 budget hostel
      food: 120,
      activities: 555,       // sum of above = 555
      total: 975,            // 975 / (3 × 100) = 325% of expected — fires HIGH
    },
  };

  const budget = await runRiskPass(budgetTrip);
  console.log('\nriskFlags:');
  console.log(JSON.stringify(budget.riskFlags, null, 2));
  console.log(`\nconfidenceScore: ${budget.confidenceScore}`);

  // ─── Scenario 4: WEATHER MOCK ────────────────────────────────────────────
  section('SCENARIO 4 — WEATHER_MOCK=true (canned flag, no HTTP call)');

  const origMock = process.env.WEATHER_MOCK;
  process.env.WEATHER_MOCK = 'true';

  const weatherTrip: TripInput = {
    destination: 'Kyoto, Japan',
    durationDays: 3,
    budgetTier: 'Medium',
    startDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days out
    destinationLat: 35.0116,
    destinationLng: 135.7681,
    itinerary: [
      { dayNumber: 1, activities: [{ title: 'Fushimi Inari', estimatedCostUSD: 0, lat: 34.9671, lng: 135.7727 }] },
      { dayNumber: 2, activities: [{ title: 'Arashiyama Bamboo Grove', estimatedCostUSD: 0, lat: 35.0094, lng: 135.6717 }] },
      { dayNumber: 3, activities: [{ title: 'Nijo Castle', estimatedCostUSD: 12, lat: 35.0142, lng: 135.7480 }] },
    ],
    estimatedBudget: null,
  };

  const weather = await runRiskPass(weatherTrip);
  process.env.WEATHER_MOCK = origMock ?? '';

  console.log('\nriskFlags:');
  console.log(JSON.stringify(weather.riskFlags, null, 2));
  console.log(`\nconfidenceScore: ${weather.confidenceScore}`);

  // ─── Scenario 5: ALL THREE COMBINED ──────────────────────────────────────
  section('SCENARIO 5 — ALL THREE TYPES COMBINED');

  process.env.WEATHER_MOCK = 'true';

  const combinedTrip: TripInput = {
    destination: 'Tokyo, Japan',
    durationDays: 2,
    budgetTier: 'Low',
    startDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), // 5 days out → forecast
    destinationLat: 35.6762,
    destinationLng: 139.6503,
    itinerary: [
      {
        dayNumber: 1,
        activities: [
          // PACING: Shinjuku → Mt Fuji — ~100 km HIGH
          { title: 'Shinjuku Station Area', estimatedCostUSD: 50, lat: 35.6905, lng: 139.7005 },
          { title: 'Mt Fuji 5th Station', estimatedCostUSD: 40, lat: 35.3731, lng: 138.7314 },
        ],
      },
      {
        dayNumber: 2,
        activities: [
          // Budget spike on day 2 — expensive relative to rest
          { title: 'Luxury Sushi Omakase', estimatedCostUSD: 400, lat: 35.6812, lng: 139.7671 },
          { title: 'Tokyo Disneyland', estimatedCostUSD: 100, lat: 35.6329, lng: 139.8804 },
        ],
      },
    ],
    estimatedBudget: {
      transport: 60,
      accommodation: 80,   // 2 nights budget
      food: 450,
      activities: 590,
      total: 1180,          // 1180 / (2 × 100) = 590% — HIGH budget
    },
  };

  const combined = await runRiskPass(combinedTrip);
  process.env.WEATHER_MOCK = origMock ?? '';

  console.log('\nriskFlags:');
  console.log(JSON.stringify(combined.riskFlags, null, 2));
  console.log(`\nconfidenceScore: ${combined.confidenceScore}`);
  console.log('\nBreakdown:');
  const high = combined.riskFlags.filter((f: { severity: string }) => f.severity === 'high').length;
  const med  = combined.riskFlags.filter((f: { severity: string }) => f.severity === 'medium').length;
  const low  = combined.riskFlags.filter((f: { severity: string }) => f.severity === 'low').length;
  console.log(`  high=${high} medium=${med} low=${low}`);
  console.log(`  Score formula: 100 - (15×${high} + 8×${med} + 3×${low}) = ${100 - 15*high - 8*med - 3*low} → clamped → ${combined.confidenceScore}`);

  section('DONE');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
