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

# US-018 / US-019: onboarding progress across the nine stages.
req GET /api/onboarding/progress "$JAR1"
                                       check "$STATUS" 200 "onboarding progress readable"
contains "$BODY" '"current":"workspace"' "new workspace resumes at the workspace stage"
req POST /api/onboarding "$JAR1" '{"step":"workspace","data":{"workspaceName":"Acme","businessName":"Acme Labs","industry":"developer tools","businessModel":"saas","timeZone":"Mars/Olympus"}}'
                                       check "$STATUS" 400 "unknown time zone rejected"
req POST /api/onboarding "$JAR1" '{"step":"workspace","data":{"workspaceName":"Acme","businessName":"Acme Labs","industry":"developer tools","businessModel":"saas","timeZone":"Africa/Nairobi"}}'
                                       check "$STATUS" 200 "onboarding: workspace step"
req POST /api/onboarding/progress "$JAR1" '{"stage":"business","action":"skip"}'
                                       check "$STATUS" 409 "required stage cannot be skipped"
req POST /api/onboarding/progress "$JAR1" '{"stage":"connection","action":"skip"}'
                                       check "$STATUS" 200 "optional stage can be skipped"

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
req GET /api/onboarding/progress "$JAR1"
contains "$BODY" '"requiredComplete":true' "all required onboarding stages done after the steps"

# US-021 / US-025: product website analysis through the worker queue.
req POST /api/product/analyze "$JAR1" '{"url":"http://169.254.169.254/latest/meta-data"}'
                                       check "$STATUS" 400 "private address refused before any request"
req POST /api/product/analyze "$JAR1" '{"url":"example.com"}'
                                       check "$STATUS" 202 "analysis accepted"
ANALYSIS_ID=$(printf '%s' "$BODY" | jget '.analysis.id')
A_STATUS=""; for i in $(seq 1 30); do req GET "/api/product/analyze/$ANALYSIS_ID" "$JAR1"; A_STATUS=$(printf '%s' "$BODY" | jget '.analysis.status'); case "$A_STATUS" in ready|failed) break;; esac; sleep 1; done
check "$A_STATUS" "ready" "public website analysed by the worker"
contains "$BODY" '"product_name"' "analysis returns a structured profile"
req POST /api/product/analyze "$JAR1" '{"url":"https://no-such-site.invalid"}'
UNREACH_ID=$(printf '%s' "$BODY" | jget '.analysis.id')
U_STATUS=""; for i in $(seq 1 30); do req GET "/api/product/analyze/$UNREACH_ID" "$JAR1"; U_STATUS=$(printf '%s' "$BODY" | jget '.analysis.status'); case "$U_STATUS" in ready|failed) break;; esac; sleep 1; done
check "$U_STATUS" "failed" "unreachable website ends in a failed state"
contains "$BODY" '"code":"unreachable"' "failure carries a reason and a next step"

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
# Content tasks run on the worker; on a cold stack they can finish after the
# last advance, so wait for the drafts instead of checking once.
for i in $(seq 1 15); do
  req GET /api/content "$JAR1"
  CONTENT_COUNT=$(printf '%s' "$BODY" | jget '.items.length')
  [ -n "$CONTENT_COUNT" ] && [ "$CONTENT_COUNT" -ge 1 ] 2>/dev/null && break
  sleep 2; drive 1 "$JAR1"
done
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

# US-034 export mode: an approved post exports with its own tracked link.
req POST "/api/content/$CONTENT_ID/export" "$JAR1" '{}'
                                       check "$STATUS" 200 "approved post exported (export mode)"
contains "$BODY" "/t/" "export package carries the post's tracked link"

req POST "/api/content/$CONTENT_ID/publish" "$JAR1" '{"mode":"manual","liveUrl":"https://example.com/banyan-manual-post"}'
                                       check "$STATUS" 200 "manual publication recorded with real URL"
req POST "/api/content/$CONTENT_ID/publish" "$JAR1" '{"mode":"manual","liveUrl":"https://example.com/banyan-manual-post"}'
                                       check "$STATUS" 200 "recording the same live URL again is idempotent"
req POST "/api/content/$CONTENT_ID/export" "$JAR1" '{}'
                                       check "$STATUS" 409 "published post cannot be exported as a new final package"

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
req GET "/api/product/analyze/$ANALYSIS_ID" "$JAR3"
                                       check "$STATUS" 404 "cross-workspace analysis access denied (404)"

# US-023: a profile drafted from the website needs approval before strategy work.
req POST /api/product/analyze "$JAR3" '{"url":"example.com"}'
A3_ID=$(printf '%s' "$BODY" | jget '.analysis.id')
for i in $(seq 1 30); do req GET "/api/product/analyze/$A3_ID" "$JAR3"; S3=$(printf '%s' "$BODY" | jget '.analysis.status'); case "$S3" in ready|failed) break;; esac; sleep 1; done
req POST /api/product/profile/apply-analysis "$JAR3" "{\"analysisId\":\"$A3_ID\"}"
                                       check "$STATUS" 200 "analysis applied to the profile as a draft"
req POST /api/goals "$JAR3" '{"rawInput":"Get 20 signups from developers in 30 days"}'
                                       check "$STATUS" 409 "strategy refused until the drafted profile is approved"
req POST /api/strategies "$JAR3" '{}'
                                       check "$STATUS" 409 "strategy generation refused while analysis-drafted fields are unapproved"
req POST /api/product/profile/approve "$JAR3" '{}'
                                       check "$STATUS" 422 "profile without a description cannot be approved"
req PATCH /api/profile "$JAR3" '{"name":"Example","description":"A plain example page used for tests.","stage":"building","problem":"Founders need a stable public page to test with.","valueProp":"Always there, always the same.","website":"https://example.com"}'
                                       check "$STATUS" 200 "founder completes the profile in their own words"
req POST /api/product/profile/approve "$JAR3" '{}'
                                       check "$STATUS" 200 "profile approved"
req POST /api/goals "$JAR3" '{"rawInput":"Get 20 signups from developers in 30 days"}'
                                       check "$STATUS" 201 "strategy unlocked after approval"
req PATCH /api/profile "$JAR3" '{"name":"Example","description":"A plain example page used for tests.","stage":"building","problem":"Founders need a stable public page to test with.","valueProp":"Always there, never changes.","website":"https://example.com"}'
req GET /api/profile "$JAR3"
contains "$BODY" '"version":2' "editing an approved profile starts version 2"
contains "$BODY" '"approvedAt":null' "the new version needs approving again"

# US-042: a structured strategy, only from an approved profile.
# The founder rewrote every analysis field, so the profile is their own words and needs no extra approval.
req POST /api/strategies "$JAR3" '{}'
                                       check "$STATUS" 201 "strategy generated from the approved profile"
SID=$(printf '%s' "$BODY" | jget '.strategy.id')
contains "$BODY" '"profileVersion":2' "strategy records the profile version it came from"
contains "$BODY" '"labelled_as":"hypothesis"' "strategy is labelled a hypothesis"
contains "$BODY" '"source":"first_party"' "KPIs are first-party measurements"
contains "$BODY" '"scheduling":false' "unverified scheduling is never assumed"
case "$BODY" in *'"publishing":"socialflow"'*) bad "export mode used while SocialFlow.ai is unverified" "$BODY";; *) ok "export mode used while SocialFlow.ai is unverified";; esac
contains "$BODY" '"stale":false' "fresh strategy is not stale"
req POST /api/strategies "$JAR3" '{}'
                                       check "$STATUS" 201 "regenerating creates the next version"
contains "$BODY" '"version":2' "second strategy is version 2"
req GET "/api/strategies/$SID" "$JAR3"
contains "$BODY" '"status":"superseded"' "previous proposal superseded, not deleted"
req GET "/api/strategies/$SID" "$JAR1"
                                       check "$STATUS" 404 "another workspace cannot read the strategy"

# US-043: review, approve, reject, edit.
req GET /api/strategies "$JAR3"
S2=$(printf '%s' "$BODY" | jget '.strategy.id')
req POST "/api/strategies/$S2/reject" "$JAR3" '{"reason":""}'
                                       check "$STATUS" 400 "rejecting needs a reason"
req POST "/api/strategies/$S2/approve" "$JAR3" '{}'
                                       check "$STATUS" 200 "proposed strategy approved"
contains "$BODY" '"status":"approved"' "strategy is approved"
req POST "/api/strategies/$S2/approve" "$JAR3" '{}'
                                       check "$STATUS" 200 "approving twice is idempotent"
req POST "/api/strategies/$S2/reject" "$JAR3" '{"reason":"Changed my mind"}'
                                       check "$STATUS" 409 "an approved strategy cannot be rejected"
req GET "/api/strategies/$S2" "$JAR3"
EDIT=$(printf '%s' "$BODY" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s).strategy.body;
const draft={channels:b.channels.map(({channel,priority,rationale,formats,cites})=>({channel,priority,rationale,formats,cites})),messaging_angles:b.messaging_angles,objectives:b.objectives,frequency:b.frequency.map(f=>({...f,posts_per_week:5})),kpis:b.kpis.map(({metric,why})=>({metric,target:20,why})),assumptions:b.assumptions};
process.stdout.write(JSON.stringify({body:draft}))})')
req PATCH "/api/strategies/$S2" "$JAR3" "$EDIT"
                                       check "$STATUS" 201 "edits saved as a new version"
contains "$BODY" '"method":"edited"' "edited version is marked as edited"
contains "$BODY" '"status":"proposed"' "edited version needs approval"
S3=$(printf '%s' "$BODY" | jget '.strategy.id')
req GET "/api/strategies/$S2" "$JAR3"
contains "$BODY" '"status":"approved"' "the approved version is untouched by the edit"
BADEDIT=$(printf '%s' "$EDIT" | sed 's/"cites":\["[^]]*\]/"cites":["F999"]/')
req PATCH "/api/strategies/$S2" "$JAR3" "$BADEDIT"
                                       check "$STATUS" 422 "an edit citing a fact that does not exist is refused"
req POST /api/product/profile/approve "$JAR3" '{}'
req PATCH /api/profile "$JAR3" '{"name":"Example","description":"A plain example page used for tests, now edited.","stage":"building","problem":"Founders need a stable public page to test with.","valueProp":"Always there, never changes.","website":"https://example.com"}'
req POST "/api/strategies/$S3/approve" "$JAR3" '{}'
                                       check "$STATUS" 409 "a strategy from an older profile version cannot be approved"
contains "$BODY" 'Regenerate' "the refusal says to regenerate"
req POST "/api/strategies/$S3/approve" "$JAR1" '{}'
                                       check "$STATUS" 404 "another workspace cannot approve the strategy"

# US-044: drafts are written only from an approved strategy.
req POST /api/content/from-strategy "$JAR1" '{}'
                                       check "$STATUS" 409 "no drafts without an approved strategy"
req POST /api/content/from-strategy "$JAR3" "{\"strategyId\":\"$S3\"}"
                                       check "$STATUS" 409 "no drafts from a strategy that is not approved"
req POST /api/content/from-strategy "$JAR3" "{\"strategyId\":\"$S2\"}"
                                       check "$STATUS" 201 "drafts written from the approved strategy"
NDRAFTS=$(printf '%s' "$BODY" | jget '.created.length')
case "$NDRAFTS" in ''|0) bad "one draft per channel and format" "$BODY";; *) ok "one draft per channel and format ($NDRAFTS)";; esac
req POST /api/content/from-strategy "$JAR3" "{\"strategyId\":\"$S2\"}"
                                       check "$STATUS" 200 "writing drafts again creates no duplicates"
contains "$BODY" '"created":[]' "second run created nothing"
req GET /app/approvals "$JAR3"
contains "$BODY" "Strategy v2" "drafts wait in the approvals queue"
contains "$BODY" "1 strategy to approve" "the strategy proposal is listed in Approvals with the drafts"
req GET /app/usage "$JAR3"
contains "$BODY" "content_draft" "draft generation is recorded in the model-usage ledger"
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

# --- SSO / sign-in providers ----------------------------------------------------
# hdr PATH JAR — sets STATUS, LOC (Location header) and SETC (state cookie) without following.
hdr() {
  local out
  out=$(curl -s -o /dev/null -D - -w $'\n%{http_code}' "$BASE$1" -b "$2" -c "$2")
  STATUS=${out##*$'\n'}
  LOC=$(printf '%s' "$out" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | tail -1)
  SETC=$(printf '%s' "$out" | tr -d '\r' | grep -i '^set-cookie: banyan_oauth=' | head -1)
}
req GET /app/settings "$JAR1";         check "$STATUS" 200 "settings page loads"
contains "$BODY" "Sign-in methods" "settings lists sign-in methods"
JARO=/tmp/e2e-jar-oauth.txt; rm -f "$JARO" /tmp/e2e-empty-jar.txt
req GET /login "$JARO"
case "$BODY" in
  *"/api/auth/oauth/github/start"*)
    ok "configured provider (GitHub) offered on the sign-in page"
    hdr "/api/auth/oauth/github/start?next=%2Fapp%2Fgoals" "$JARO"
    check "$STATUS" 302 "provider start redirects to the provider"
    contains "$LOC" "https://github.com/login/oauth/authorize?" "start goes to GitHub's authorize endpoint"
    contains "$LOC" "code_challenge_method=S256" "start sends a PKCE challenge"
    contains "$SETC" "HttpOnly" "state cookie is HttpOnly"
    hdr "/api/auth/oauth/github/callback?code=fake&state=forged" "$JARO"
    contains "$LOC" "error=expired" "callback with a forged state is refused"
    hdr "/api/auth/oauth/github/callback?code=fake&state=x" /tmp/e2e-empty-jar.txt
    contains "$LOC" "error=expired" "callback without the state cookie is refused"
    hdr "/api/auth/oauth/github/start" "$JARO"
    ST=$(printf '%s' "$LOC" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')
    hdr "/api/auth/oauth/github/callback?code=fake&state=$ST" "$JARO"
    contains "$LOC" "error=token_exchange_failed" "matching state with a fake code fails at the token exchange"
    hdr "/api/auth/oauth/github/callback?error=access_denied" "$JARO"
    contains "$LOC" "error=cancelled" "declining at the provider shows a cancelled message"
    hdr "/api/auth/oauth/github/start?next=https%3A%2F%2Fevil.example" "$JARO"
    case "$LOC" in *evil.example*) bad "off-site next is never carried" "$LOC";; *) ok "off-site next is never carried";; esac;;
  *) say "SKIP: no OAuth provider configured (set OAUTH_GITHUB_CLIENT_ID/SECRET to run the provider checks)";;
esac
hdr "/api/auth/oauth/myspace/start" "$JARO"
contains "$LOC" "error=not_configured" "unknown provider refused"
req POST /api/auth/oauth/complete "$JARO" '{"name":"X user","email":"x@test.invalid"}'
check "$STATUS" 410 "finishing a provider sign-up needs the sealed pending cookie"
req DELETE /api/auth/oauth/accounts/anything "$JARO"
check "$STATUS" 401 "disconnecting a provider requires a session"
rm -f "$JARO" /tmp/e2e-empty-jar.txt

req POST /api/auth/logout "$JAR1";     check "$STATUS" 200 "logout works"
req GET /api/goals "$JAR1";            check "$STATUS" 401 "session invalidated after logout"

# --- Summary -------------------------------------------------------------------
rm -f "$JAR1" "$JAR2" "$JAR3" /tmp/e2e-big.json
say "------------------------------------------------------------"
say "E2E acceptance: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && { say "ALL CHECKS PASSED"; exit 0; } || { say "ACCEPTANCE FAILED"; exit 1; }
