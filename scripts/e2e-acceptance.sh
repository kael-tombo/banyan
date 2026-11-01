#!/usr/bin/env bash
# =============================================================================
# Banyan — end-to-end acceptance run
#
# Drives the complete founder journey against a LIVE server and asserts the
# honest-behavior guarantees. Run with a dev or prod server on :3000:
#
#   BASE_URL=http://localhost:3000 bash scripts/e2e-acceptance.sh
#
# Exit code 0 = all checks passed. Creates test users in the target database
# (clean them later with scripts/cleanup-e2e.ts if desired).
# =============================================================================
set -u
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); say "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); say "FAIL: $1"; [ -n "${2:-}" ] && say "      -> $2"; return 0; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "expected [$2] got [$1] ${4:-}"; fi; }
contains(){ case "$1" in *"$2"*) ok "$3";; *) bad "$3" "expected body containing [$2], got [${1:0:300}]";; esac; }

# jget PATH < body-json — extract a field with node (PATH like '.goal.id')
jget() {
  node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{const o=JSON.parse(s);
        const v=(new Function('o','try{return o$1}catch(e){return undefined}'))(o);
        process.stdout.write(v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):String(v));
      }catch(e){process.stdout.write('')}
    })" 2>/dev/null
}

# req METHOD PATH JAR [DATA] — sets STATUS and BODY (auto cookie jar refresh)
req() {
  local m=$1 p=$2 jar=$3 data=${4:-} out
  local args=(-s -w $'\n%{http_code}' -X "$m" "$BASE$p" -H "origin: $BASE" -b "$jar" -c "$jar")
  [ -n "$data" ] && args+=(-H "content-type: application/json" -d "$data")
  out=$(curl "${args[@]}")
  STATUS=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

STAMP=$(date +%s)
U1="e2e-$STAMP@test.banyan.local"
U2="e2e-b-$STAMP@test.banyan.local"
JAR1=/tmp/e2e-jar1.txt JAR2=/tmp/e2e-jar2.txt JAR3=/tmp/e2e-jar3.txt
rm -f "$JAR1" "$JAR2" "$JAR3" /tmp/e2e-big.json

say "=== Banyan E2E acceptance @ $BASE ($(date -u +%H:%M:%SZ)) ==="

# --- 1. Public surface -------------------------------------------------------
req GET / "$JAR1";                     check "$STATUS" 200 "landing page loads"
req GET /api/goals "$JAR1";            check "$STATUS" 401 "API requires auth (unauthenticated 401)"
req POST /api/auth/login "$JAR1" '{"email":"nobody@test.invalid","password":"wrong"}'
                                       check "$STATUS" 401 "wrong credentials rejected"
req POST /api/auth/login "$JAR1" '{"email":"founder@banyan.ai","password":"nope"}'
                                       check "$STATUS" 401 "seeded account not brute-forceable with wrong password"

# --- 2. Signup + onboarding --------------------------------------------------
req POST /api/auth/signup "$JAR1" "{\"name\":\"E2E Founder\",\"email\":\"$U1\",\"password\":\"e2e-password-1\"}"
                                       check "$STATUS" 201 "signup works"
req GET /api/goals "$JAR1";            check "$STATUS" 200 "session cookie grants API access"

req POST /api/onboarding "$JAR1" '{"step":"product","data":{"name":"Acme Launch Tracker","description":"Acme helps indie founders track product launches across communities, newsletters and social channels in one place.","website":"https://example.com/acme","stage":"public_beta","problem":"Founders scatter launch updates across five tools and never learn which channel actually brought users.","valueProp":"One tracker shows every launch, its channel and its conversions in real time."}}'
                                       check "$STATUS" 200 "onboarding: product step"
req POST /api/onboarding "$JAR1" '{"step":"audience","data":{"audience":"Indie founders shipping their first product","pain":"No idea which distribution channel converts","outcome":"Confident channel decisions with tracked evidence","geography":"Global English-speaking"}}'
                                       check "$STATUS" 200 "onboarding: audience step"
req POST /api/onboarding "$JAR1" '{"step":"goal","data":{"goal":"first_users","goalTarget":50,"goalMetric":"signups"}}'
                                       check "$STATUS" 200 "onboarding: goal step"
req POST /api/onboarding "$JAR1" '{"step":"channels","data":{"channels":["x","linkedin"]}}'
                                       check "$STATUS" 200 "onboarding: channels step"
req POST /api/onboarding "$JAR1" '{"step":"voice","data":{"tone":"plain, founder-to-founder","language":"en"}}'
                                       check "$STATUS" 200 "onboarding: voice step"

req GET /api/profile "$JAR1"
NAME=$(printf '%s' "$BODY" | jget '.profile.name'); SITE=$(printf '%s' "$BODY" | jget '.profile.website')
[ "$NAME" = "Acme Launch Tracker" ] && ok "profile persisted (name)" || bad "profile persisted (name)" "got name=[$NAME]"
[ "$SITE" = "https://example.com/acme" ] && ok "profile persisted (website)" || bad "profile persisted (website)" "got site=[$SITE]"

# --- 3. Goal -> plan -> human approval gate ----------------------------------
req POST /api/goals "$JAR1" '{"rawInput":"Grow a founder audience on X by posting 3 short threads a week and measuring signups for the next 2 weeks"}'
GOAL_ID=$(printf '%s' "$BODY" | jget '.goal.id')
[ -n "$GOAL_ID" ] && ok "goal created from natural language" || { bad "goal created" "no goal id in: ${BODY:0:200}"; exit 1; }

drive() { # drive N JAR — advance the workflow N times (rate limit 30/min)
  local n=$1 jar=$2 i executed promoted blocked
  for ((i=0;i<n;i++)); do
    sleep 2.2
    req POST "/api/goals/$GOAL_ID/advance" "$jar"
    if [ "$STATUS" = "429" ]; then sleep 12; req POST "/api/goals/$GOAL_ID/advance" "$jar"; fi
    executed=$(printf '%s' "$BODY" | jget '.report.executed')
    # nothing executable left and nothing promoted -> stop early
    if [ "$executed" = "0" ]; then
      promoted=$(printf '%s' "$BODY" | jget '.report.promoted')
      blocked=$(printf '%s' "$BODY" | jget '.report.blockedByDeps')
      [ "$promoted" = "0" ] && [ "$blocked" = "0" ] && break
    fi
  done
}

drive 6 "$JAR1"
req GET "/api/goals/$GOAL_ID" "$JAR1"
PLAN_STATUS=$(printf '%s' "$BODY" | jget '.goal.plan.status')
check "$PLAN_STATUS" planned "plan drafted and awaits human approval"

req POST "/api/goals/$GOAL_ID/plan/approve" "$JAR1" '{"decision":"approve"}'
                                       check "$STATUS" 200 "human approves the plan"

# --- 4. Agents produce research -> strategy -> campaign -> content ------------
drive 16 "$JAR1"
req GET /api/content "$JAR1"
CONTENT_COUNT=$(printf '%s' "$BODY" | jget '.items.length')
[ -n "$CONTENT_COUNT" ] && [ "$CONTENT_COUNT" -ge 1 ] 2>/dev/null && ok "content drafted by agents ($CONTENT_COUNT items)" || bad "content drafted" "items=$CONTENT_COUNT body=${BODY:0:200}"
CONTENT_ID=$(printf '%s' "$BODY" | jget '.items[0].id')

req GET "/api/goals/$GOAL_ID" "$JAR1"
TASKS=$(printf '%s' "$BODY" | jget '.tasks.length')
[ -n "$TASKS" ] && [ "$TASKS" -ge 5 ] 2>/dev/null && ok "agent tasks tracked ($TASKS)" || bad "agent tasks tracked" "tasks=$TASKS"

# --- 5. Honest publish: blocked without a connection, manual path works -------
# Every drafted item must be submitted + approved before the gate will close.
req GET /api/content "$JAR1"
CONTENT_IDS=$(printf '%s' "$BODY" | jget '.items.map(i=>i.id).join(" ")')
[ -n "$CONTENT_IDS" ] && ok "content items to review: $(printf '%s' "$CONTENT_IDS" | wc -w | tr -d ' ')" || bad "content list for review" "no items"
for CID in $CONTENT_IDS; do
  req POST "/api/content/$CID/review" "$JAR1" '{"action":"submit"}';  check "$STATUS" 200 "content $CID submitted for review"
  req POST "/api/content/$CID/review" "$JAR1" '{"action":"approve"}'; check "$STATUS" 200 "content $CID approved by human"
done

# Close the workflow's approval_gate task (explicit human action after the
# content UI approval — the gate requires every item to be reviewed first).
req GET "/api/goals/$GOAL_ID" "$JAR1"
GATE_ID=$(printf '%s' "$BODY" | jget '.tasks.find(t=>t.type==="approval_gate").id')
[ -n "$GATE_ID" ] && ok "approval gate located in workflow" || bad "approval gate located" "no waiting gate task"
req POST "/api/tasks/$GATE_ID" "$JAR1" '{"action":"approve_gate"}'
                                       check "$STATUS" 200 "approval gate closed by human decision"

req POST "/api/content/$CONTENT_ID/publish" "$JAR1" '{"mode":"now"}'
case "$BODY" in
  *onnection*|*blocked*|*locked*) ok "publish without connection blocked honestly";;
  *) bad "publish without connection blocked honestly" "body=${BODY:0:300}";;
esac

# US-028: Postiz is removed; no connection can be created for it (or any provider until SocialFlow.ai is verified).
req POST /api/connections "$JAR1" '{"channel":"x","adapter":"postiz","credentials":{"apiKey":"k"}}'
                                       check "$STATUS" 400 "removed provider (postiz) cannot be connected"

req POST "/api/content/$CONTENT_ID/publish" "$JAR1" '{"mode":"manual","liveUrl":"https://example.com/banyan-manual-post"}'
                                       check "$STATUS" 200 "manual publication recorded with real URL"

# --- 6. Experiments + evidence-aware learning ---------------------------------
req POST /api/experiments "$JAR1" '{"title":"X thread hook A/B","hypothesis":"Problem-first hooks get more profile clicks than feature-first hooks for founder audiences","channel":"x","variable":"hook order: problem-first vs feature-first","successMetric":"profile clicks per thread"}'
EXP_ID=$(printf '%s' "$BODY" | jget '.experiment.id')
[ -n "$EXP_ID" ] && ok "experiment created" || bad "experiment created" "body=${BODY:0:200}"

req PATCH "/api/experiments/$EXP_ID" "$JAR1" '{"status":"complete","results":"12 profile clicks, 3 signups over 4 threads","interpretation":"Problem-first hooks outperformed but sample is tiny","limitations":"One week, one account, no control group"}'
                                       check "$STATUS" 200 "results recorded manually (honest, no fabricated analytics)"

drive 10 "$JAR1"
req GET "/api/goals/$GOAL_ID" "$JAR1"
RECO_COUNT=$(printf '%s' "$BODY" | jget '.recommendations.length')
[ -n "$RECO_COUNT" ] && [ "$RECO_COUNT" -ge 1 ] 2>/dev/null && ok "recommendation produced from evidence" || bad "recommendation produced" "count=$RECO_COUNT body=${BODY:0:300}"
CONF=$(printf '%s' "$BODY" | jget '.recommendations[0].confidence')
[ -n "$CONF" ] && ok "recommendation carries confidence ($CONF)" || bad "recommendation carries confidence" "missing"

# --- 7. Persistence across re-login -------------------------------------------
req POST /api/auth/login "$JAR2" "{\"email\":\"$U1\",\"password\":\"e2e-password-1\"}"
                                       check "$STATUS" 200 "re-login works"
req GET "/api/goals/$GOAL_ID" "$JAR2"
PERSIST=$(printf '%s' "$BODY" | jget '.goal.id')
check "$PERSIST" "$GOAL_ID" "goal and its data persist across sessions"

# --- 8. Tenant isolation -------------------------------------------------------
req POST /api/auth/signup "$JAR3" "{\"name\":\"E2E Other\",\"email\":\"$U2\",\"password\":\"e2e-password-2\"}"
                                       check "$STATUS" 201 "second user signs up"
req GET "/api/goals/$GOAL_ID" "$JAR3"
check "$STATUS" 404 "cross-workspace goal access denied (404)"
req GET "/api/content/$CONTENT_ID" "$JAR3"
check "$STATUS" 404 "cross-workspace content access denied (404)"

# --- 9. Abuse controls ----------------------------------------------------------
node -e 'process.stdout.write(JSON.stringify({rawInput:"x".repeat(600000)}))' > /tmp/e2e-big.json
req POST /api/goals "$JAR1"; STATUS_413=""
out=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/goals" -H "origin: $BASE" -H "content-type: application/json" -b "$JAR1" --data-binary @/tmp/e2e-big.json)
                                       check "$out" 413 "oversized request body rejected (413)"
req POST /api/goals "$JAR1" '{broken json'; check "$STATUS" 400 "malformed JSON rejected (400)"

# SSRF: product URL intake is the outbound fetch of a user-supplied URL (the
# connection probe it replaces went away with Postiz). Cloud metadata and
# private addresses must be refused before any request is made.
req POST /api/product/intake "$JAR1" '{"url":"http://169.254.169.254/latest/meta-data"}'
contains "$BODY" "Blocked" "SSRF attempt against cloud metadata blocked"
check "$STATUS" 400 "SSRF attempt rejected with 400"

req POST /api/auth/logout "$JAR1";     check "$STATUS" 200 "logout works"
req GET /api/goals "$JAR1";            check "$STATUS" 401 "session invalidated after logout"

# --- Summary -------------------------------------------------------------------
rm -f "$JAR1" "$JAR2" "$JAR3" /tmp/e2e-big.json
say "------------------------------------------------------------"
say "E2E acceptance: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && { say "ALL CHECKS PASSED"; exit 0; } || { say "ACCEPTANCE FAILED"; exit 1; }
