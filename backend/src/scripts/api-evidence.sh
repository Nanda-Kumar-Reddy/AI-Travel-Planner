#!/usr/bin/env bash
# api-evidence.sh — live API verification via curl
# Backend must be running on port 5000.
set -e

BASE="http://localhost:5000"
COOKIE_JAR="/tmp/evidence-cookies-$$.txt"
EMAIL="evidence-$$@test.dev"

sep() { printf '\n%s\n  %s\n%s\n' '════════════════════════════════════════════════════' "$1" '════════════════════════════════════════════════════'; }

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

# ── STEP 1: Register ──────────────────────────────────────────────────────────
sep "STEP 1 — Register temp user ($EMAIL)"
REG=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Evidence Bot\",\"email\":\"$EMAIL\",\"password\":\"Test1234!\"}")
echo "POST /api/auth/register response:"
echo "$REG" | python3 -m json.tool 2>/dev/null || echo "$REG"

# ── STEP 2: Create trip ───────────────────────────────────────────────────────
sep "STEP 2 — Create trip (Tokyo, Low budget, 2 days)"
CREATE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/trips" \
  -H "Content-Type: application/json" \
  -d '{"destination":"Tokyo, Japan","durationDays":2,"budgetTier":"Low","interests":["history","food"],"startDate":null}')

# Extract key fields
TRIP_ID=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['trip']['_id'])" 2>/dev/null)
SCORE_BEFORE=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['trip']['confidenceScore'])" 2>/dev/null)
FLAGS=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['trip']['riskFlags'], indent=2))" 2>/dev/null)

echo "Trip ID: $TRIP_ID"
echo "confidenceScore (initial): $SCORE_BEFORE"
echo ""
echo "riskFlags (initial):"
echo "$FLAGS"

if [ -z "$TRIP_ID" ]; then
  echo "ERROR: no trip ID — full response:"
  echo "$CREATE" | python3 -m json.tool 2>/dev/null || echo "$CREATE"
  exit 1
fi

# ── STEP 3: Fix This — regenerate day 1 with riskContext ─────────────────────
sep "STEP 3 — Fix This: POST /api/trips/$TRIP_ID/days/1/regenerate (riskContext)"

# Use first flag's message as riskContext, or a default
RISK_MSG=$(echo "$FLAGS" | python3 -c "
import sys,json
flags = json.load(sys.stdin)
if flags:
    f = flags[0]
    print(f\"{f['message']} — {f['suggestedFix']}\")
else:
    print('Rearrange Day 1 activities to be geographically clustered — avoid activities more than 10km apart.')
" 2>/dev/null)

echo "riskContext passed to endpoint:"
echo "  \"$RISK_MSG\""
echo ""
echo "scoreBefore: $SCORE_BEFORE"

REGEN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/trips/$TRIP_ID/days/1/regenerate" \
  -H "Content-Type: application/json" \
  -d "{\"riskContext\":$(echo "$RISK_MSG" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}")

SCORE_AFTER=$(echo "$REGEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['trip']['confidenceScore'])" 2>/dev/null)
echo "scoreAfter:  $SCORE_AFTER"
echo ""
echo "Full diff object:"
echo "$REGEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['diff'], indent=2))" 2>/dev/null
echo ""
echo "Updated riskFlags after fix:"
echo "$REGEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['trip']['riskFlags'], indent=2))" 2>/dev/null
echo ""
echo "New confidenceScore: $SCORE_AFTER"

# ── STEP 4: Delete trip ───────────────────────────────────────────────────────
sep "STEP 4 — Cleanup (DELETE trip)"
DEL=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X DELETE "$BASE/api/trips/$TRIP_ID" \
  -H "Content-Type: application/json")
echo "DELETE /api/trips/$TRIP_ID → $(echo "$DEL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','?'))" 2>/dev/null)"

sep "DONE"
