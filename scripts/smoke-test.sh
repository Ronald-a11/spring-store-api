#!/usr/bin/env bash
# End-to-end smoke test for the ported spring-api-finished store API,
# including the "fixes beyond the course" (README.md > Fixes beyond the course).
#
# Every expected status code / body below is derived from the project sources
# (controllers, *SecurityRules, SecurityConfig, GlobalExceptionHandler, services).
# Where a fix intentionally changed the course behaviour, the check name carries
# the fix id from the specification (S1..S6 auth/common, U1..U5 users,
# P1..P2 products, C1..C2 carts, W1..W3 payments).
#
# Usage:  BASE_URL=http://localhost:8080 bash smoke-test.sh
# Re-runnable: all e-mails carry a per-run timestamp suffix.
# Exits non-zero if any check fails.

BASE_URL="${BASE_URL:-http://localhost:8080}"
TS="$(date +%s)$$"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
FAILED_NAMES=()

ok()  { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); printf 'FAIL  %s -- %s\n' "$1" "$2"; }

section() { printf '\n== %s ==\n' "$1"; }

# pyq <json> <python expr over d>   -- json helper (no jq on this box)
pyq() {
  printf '%s' "$1" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stdout.write('__PARSE_ERROR__'); sys.exit()
try:
    sys.stdout.write(str($2))
except Exception as e:
    sys.stdout.write('__ERR__:' + str(e))
"
}

MYSQLQ() { docker exec store-mysql mysql -uroot -pMyPassword! store_api -N -B -e "$1" 2>/dev/null; }

# req METHOD PATH [DATA] [TOKEN] [EXTRA_HEADER]  -> sets STATUS, BODY, HDRS
# Set CT=<media type> before the call to override the Content-Type sent with DATA.
req() {
  local method="$1" path="$2" data="${3:-}" token="${4:-}" extra="${5:-}"
  local args=(-s -o "$TMP/body" -D "$TMP/hdr" -w '%{http_code}' -X "$method" "$BASE_URL$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$extra" ] && args+=(-H "$extra")
  [ -n "$data" ] && args+=(-H "Content-Type: ${CT:-application/json}" --data "$data")
  STATUS="$(curl "${args[@]}")"
  BODY="$(cat "$TMP/body")"
  HDRS="$(cat "$TMP/hdr")"
}

# head_req PATH [TOKEN] -> STATUS, HDRS   (curl -I sends a real HEAD request)
head_req() {
  local args=(-s -o /dev/null -I -D "$TMP/hdr" -w '%{http_code}')
  [ -n "${2:-}" ] && args+=(-H "Authorization: Bearer $2")
  STATUS="$(curl "${args[@]}" "$BASE_URL$1")"
  HDRS="$(cat "$TMP/hdr")"
  BODY=""
}

# mint_jwt <claims-json> -> prints an HS256 JWT signed with JWT_SECRET read from
# $PROJECT_DIR/.env (the secret stays inside the python process and is never
# printed). Prints nothing when no secret is readable. Mirrors JwtConfig:
# Keys.hmacShaKeyFor(secret.getBytes()), i.e. the raw UTF-8 bytes of the value.
mint_jwt() {
  python - "$PROJECT_DIR/.env" "$1" <<'PY'
import sys, re, json, hmac, hashlib, base64
env_path, claims = sys.argv[1], sys.argv[2]
secret = None
try:
    for line in open(env_path, encoding='utf-8'):
        m = re.match(r'^\s*JWT_SECRET\s*=\s*(.*?)\s*$', line)
        if m:
            secret = m.group(1).strip().strip('"').strip("'")
except OSError:
    pass
if not secret:
    sys.exit()
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
p = b64(claims.encode())
s = b64(hmac.new(secret.encode(), (h + '.' + p).encode(), hashlib.sha256).digest())
sys.stdout.write(h + '.' + p + '.' + s)
PY
}

expect_status() { # name expected
  if [ "$STATUS" = "$2" ]; then
    ok "$1 (HTTP $STATUS)"
  else
    bad "$1" "expected HTTP $2, got $STATUS; body: $(printf '%s' "$BODY" | head -c 300)"
  fi
}

expect_body_contains() { # name needle
  case "$BODY" in
    *"$2"*) ok "$1 (body contains '$2')" ;;
    *) bad "$1" "body does not contain '$2'; got: $(printf '%s' "$BODY" | head -c 300)" ;;
  esac
}

expect_body_empty() { # name
  if [ -z "$BODY" ]; then ok "$1 (empty body)"; else bad "$1" "expected an empty body, got: $(printf '%s' "$BODY" | head -c 200)"; fi
}

expect_eq() { # name actual expected
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1" "expected '$3', got '$2'"; fi
}

expect_header_contains() { # name needle (case-insensitive grep over the response headers)
  if printf '%s' "$HDRS" | grep -qi -- "$2"; then
    ok "$1 (header matches '$2')"
  else
    bad "$1" "no header matching '$2'"
  fi
}

printf 'Smoke test against %s  (run id %s)\n' "$BASE_URL" "$TS"

############################################################
section "Infrastructure / docs"
############################################################
# Fix beyond the course: SwaggerSecurityRules permits GET "/", so the Thymeleaf
# home page is public and links to the API docs.
req GET "/"
expect_status "GET / anonymous is 200 (public home page)" 200
expect_body_contains "GET / links to Swagger UI" "swagger-ui/index.html"

# Fix beyond the course: the home page is a storefront driven by /app.js; its
# assets are permitted for GET only (SwaggerSecurityRules), and the template
# must not contain Thymeleaf inlining sequences ("[[" / "[(") that would be
# processed as expressions.
expect_body_contains "GET / loads the storefront script" '<script src="/app.js">'
expect_body_contains "GET / loads the storefront stylesheet" 'href="/app.css"'
case "$BODY" in
  *"[["*|*"[("*) bad "GET / has no Thymeleaf inlining sequences" "rendered page contains '[[' or '[('" ;;
  *) ok "GET / has no Thymeleaf inlining sequences" ;;
esac

req GET "/app.js"
expect_status "GET /app.js anonymous is 200 (storefront asset, permitAll GET only)" 200
expect_body_contains "GET /app.js is the storefront script" "Mosh's Grocery"
req GET "/app.css"
expect_status "GET /app.css anonymous is 200 (storefront asset, permitAll GET only)" 200
req POST "/app.js"
expect_status "POST /app.js anonymous is 401 (only GET is permitted)" 401

req GET "/swagger-ui.html"
expect_status "GET /swagger-ui.html redirects (SwaggerSecurityRules permitAll)" 302

req GET "/swagger-ui/index.html"
expect_status "GET /swagger-ui/index.html is 200" 200

req GET "/v3/api-docs"
expect_status "GET /v3/api-docs is 200" 200
expect_body_contains "GET /v3/api-docs is an OpenAPI doc" '"openapi"'
# S5: OpenApiConfig declares the bearerAuth scheme so Swagger UI gets an Authorize button.
expect_body_contains "S5: /v3/api-docs declares the bearerAuth security scheme" '"bearerAuth"'
expect_eq "S5: bearerAuth is an http/bearer scheme" \
  "$(pyq "$BODY" "d['components']['securitySchemes']['bearerAuth']['type'] + '/' + d['components']['securitySchemes']['bearerAuth']['scheme']")" "http/bearer"
expect_eq "S5: bearerAuth is applied globally" \
  "$(pyq "$BODY" "any('bearerAuth' in s for s in d['security'])")" "True"
expect_eq "S5: info.title is 'Store API'" "$(pyq "$BODY" "d['info']['title']")" "Store API"

############################################################
section "Products - public reads (ProductSecurityRules: GET/HEAD permitAll)"
############################################################
req GET "/products"
expect_status "GET /products is 200" 200
PRODUCT_COUNT="$(pyq "$BODY" "len(d)")"
if [ "$PRODUCT_COUNT" -ge 10 ] 2>/dev/null; then
  ok "GET /products returns V5 seed data ($PRODUCT_COUNT products)"
else
  bad "GET /products returns V5 seed data" "expected >=10 products, got '$PRODUCT_COUNT'"
fi
P1_ID="$(pyq "$BODY" "d[0]['id']")"
P2_ID="$(pyq "$BODY" "d[1]['id']")"
expect_eq "GET /products keeps the course field order (id,name,price,description,categoryId)" \
  "$(pyq "$BODY" "list(d[0].keys())")" "['id', 'name', 'price', 'description', 'categoryId']"

req GET "/products?categoryId=1"
expect_status "GET /products?categoryId=1 is 200" 200
expect_eq "GET /products?categoryId=1 filters correctly" \
  "$(pyq "$BODY" "all(p['categoryId'] == 1 for p in d) and len(d) > 0")" "True"

req GET "/products/$P1_ID"
expect_status "GET /products/{id} known id is 200" 200
expect_eq "GET /products/{id} returns that product" "$(pyq "$BODY" "d['id']")" "$P1_ID"

req GET "/products/999999"
expect_status "GET /products/{id} unknown id is 404" 404

# S4: HEAD is permitted alongside GET.
head_req "/products"
expect_status "S4: HEAD /products anonymous is 200" 200
head_req "/products/$P1_ID"
expect_status "S4: HEAD /products/{id} anonymous is 200" 200

# S1: type-mismatch on a path/query parameter is a 400 with an error body
# (used to be a blank 401 because the /error dispatch was blocked).
req GET "/products/abc"
expect_status "S1: GET /products/abc (non-numeric id) is 400" 400
expect_body_contains "S1: type-mismatch error body" "Invalid request parameter."

req GET "/products?categoryId=abc"
expect_status "S1: GET /products?categoryId=abc is 400" 400
expect_body_contains "S1: type-mismatch error body (query param)" "Invalid request parameter."

req GET "/products" "" "" "Accept: text/plain"
expect_status "S1: GET /products with Accept: text/plain is 406" 406

############################################################
section "Users - registration & validation"
############################################################
EMAIL_A="alice.$TS@example.com"
EMAIL_B="bob.$TS@example.com"
EMAIL_ADMIN="admin.$TS@example.com"
PASS_A="secret123"

req POST "/users" "{\"name\":\"Alice $TS\",\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}"
expect_status "POST /users registers a user (201, permitAll)" 201
USER_A_ID="$(pyq "$BODY" "d['id']")"
expect_eq "POST /users echoes the e-mail" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"
expect_eq "POST /users body has no password field" "$(pyq "$BODY" "'password' in d")" "False"
if printf '%s' "$HDRS" | grep -qi "^location:.*/users/$USER_A_ID"; then
  ok "POST /users sets Location: /users/$USER_A_ID"
else
  bad "POST /users sets Location header" "no matching Location in response headers"
fi

req POST "/users" "{\"name\":\"Bob $TS\",\"email\":\"$EMAIL_B\",\"password\":\"$PASS_A\"}"
expect_status "POST /users registers a second user" 201
USER_B_ID="$(pyq "$BODY" "d['id']")"

req POST "/users" "{\"name\":\"Alice again\",\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}"
expect_status "POST /users duplicate e-mail is 400" 400
expect_body_contains "POST /users duplicate e-mail message" "Email is already registered."

req POST "/users" "{\"name\":\"\",\"email\":\"blank.$TS@example.com\",\"password\":\"$PASS_A\"}"
expect_status "POST /users blank name is 400" 400
expect_body_contains "POST /users blank name message" "Name is required"

req POST "/users" "{\"name\":\"X\",\"email\":\"not-an-email\",\"password\":\"$PASS_A\"}"
expect_status "POST /users invalid e-mail is 400" 400
expect_body_contains "POST /users invalid e-mail message" "Email must be valid"

req POST "/users" "{\"name\":\"X\",\"email\":\"short.$TS@example.com\",\"password\":\"abc\"}"
expect_status "POST /users short password is 400" 400
expect_body_contains "POST /users short password message" "Password must be between 6 to 25 characters long."

req POST "/users" "{\"name\":\"X\",\"email\":\"UPPER.$TS@Example.COM\",\"password\":\"$PASS_A\"}"
expect_status "POST /users uppercase e-mail is 400 (@Lowercase)" 400
expect_body_contains "POST /users uppercase e-mail message" "Email must be in lowercase"

# U2: the users.email UNIQUE index (V6) is really in place.
UNIQUE_IDX="$(MYSQLQ "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='store_api' AND table_name='users' AND index_name='users_email_unique' AND non_unique=0;")"
expect_eq "U2: users_email_unique UNIQUE index exists in the store-mysql container" "$UNIQUE_IDX" "1"

############################################################
section "Auth - login / me / refresh"
############################################################
req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}"
expect_status "POST /auth/login valid credentials is 200" 200
TOKEN_A="$(pyq "$BODY" "d['token']")"
if [ -n "$TOKEN_A" ] && [ "${TOKEN_A:0:2}" = "ey" ]; then
  ok "POST /auth/login returns a JWT access token in the body"
else
  bad "POST /auth/login returns a JWT access token" "got '$TOKEN_A'"
fi
REFRESH_A="$(printf '%s' "$HDRS" | grep -i '^set-cookie: *refreshToken=' | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r')"
if [ -n "$REFRESH_A" ]; then
  ok "POST /auth/login sets a refreshToken cookie"
else
  bad "POST /auth/login sets a refreshToken cookie" "no Set-Cookie: refreshToken in headers"
fi
if printf '%s' "$HDRS" | grep -i '^set-cookie: *refreshToken=' | grep -qi 'HttpOnly'; then
  ok "refreshToken cookie is HttpOnly"
else
  bad "refreshToken cookie is HttpOnly" "HttpOnly flag missing"
fi
if printf '%s' "$HDRS" | grep -i '^set-cookie: *refreshToken=' | grep -qi 'Path=/auth/refresh'; then
  ok "refreshToken cookie is scoped to Path=/auth/refresh"
else
  bad "refreshToken cookie Path" "expected Path=/auth/refresh"
fi

req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"wrong-password\"}"
expect_status "POST /auth/login wrong password is 401" 401

req POST "/auth/login" "{\"email\":\"$EMAIL_B\",\"password\":\"$PASS_A\"}"
expect_status "POST /auth/login second user is 200" 200
TOKEN_B="$(pyq "$BODY" "d['token']")"

req GET "/auth/me" "" "$TOKEN_A"
expect_status "GET /auth/me with a valid token is 200" 200
expect_eq "GET /auth/me returns the logged-in user" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"
expect_eq "GET /auth/me exposes no password" "$(pyq "$BODY" "'password' in d")" "False"

req GET "/auth/me"
expect_status "GET /auth/me without a token is 401" 401

req GET "/auth/me" "" "garbage.token.value"
expect_status "GET /auth/me with a garbage token is 401" 401

# The cookie carries the Secure flag, so curl's jar will not replay it over
# plain http -- send it explicitly, which is what a browser on https does.
req POST "/auth/refresh" "" "" "Cookie: refreshToken=$REFRESH_A"
expect_status "POST /auth/refresh with the cookie is 200" 200
expect_eq "POST /auth/refresh returns a new access token" \
  "$(pyq "$BODY" "d['token'].startswith('ey')")" "True"

# S1: MissingRequestCookieException now has a deliberate 401 handler (same
# status the blocked /error dispatch used to produce by accident).
req POST "/auth/refresh"
expect_status "POST /auth/refresh without the cookie is 401" 401

# S2: access and refresh tokens carry a "type" claim and are not interchangeable.
req GET "/auth/me" "" "$REFRESH_A"
expect_status "S2: refresh token used as a Bearer access token is 401" 401

req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_A"
expect_status "S2: access token used as the refreshToken cookie is 401" 401

# S3: the Bearer prefix is stripped with substring(7), so a doubled prefix is
# an invalid token (replace() used to strip both and accept it).
req GET "/auth/me" "" "Bearer $TOKEN_A"
expect_status "S3: 'Authorization: Bearer Bearer <token>' is 401" 401

# S3: an empty token no longer escapes as an IllegalArgumentException.
req GET "/products" "" "" "Authorization: Bearer "
expect_status "S3: 'Authorization: Bearer ' (empty token) on a public endpoint is 200" 200
req GET "/auth/me" "" "" "Authorization: Bearer "
expect_status "S3: 'Authorization: Bearer ' (empty token) on a protected endpoint is 401" 401

# S1: framework errors reach /error or a GlobalExceptionHandler mapping instead
# of a blank 401.
req GET "/nonexistent" "" "$TOKEN_A"
expect_status "S1: GET /nonexistent with a valid token is 404" 404
expect_body_contains "S1: 404 carries Spring Boot's JSON error body" '"status":404'

req PATCH "/products/$P1_ID" '{"name":"x"}' "$TOKEN_A"
expect_status "S1: PATCH /products/{id} is 405" 405
expect_body_contains "S1: 405 error body" "Method not allowed."

CT="text/plain"
req POST "/auth/login" "email=$EMAIL_A"
unset CT
expect_status "S1: POST /auth/login with Content-Type: text/plain is 415" 415
expect_body_contains "S1: 415 error body" "Unsupported media type."

# The Thymeleaf home page renders the same storefront with a token as without.
req GET "/" "" "$TOKEN_A"
expect_status "GET / authenticated renders the Thymeleaf page" 200
# th:text HTML-escapes the apostrophe, so the rendered h1 reads Mosh&#39;s Grocery.
expect_body_contains "GET / renders the store name from the model (h1)" "<h1>Mosh&#39;s Grocery</h1>"

############################################################
section "Admin - promotion & role-gated endpoints"
############################################################
req POST "/users" "{\"name\":\"Admin $TS\",\"email\":\"$EMAIL_ADMIN\",\"password\":\"$PASS_A\"}"
expect_status "POST /users registers the soon-to-be admin" 201
MYSQLQ "UPDATE users SET role='ADMIN' WHERE email='$EMAIL_ADMIN';" >/dev/null
ROLE="$(MYSQLQ "SELECT role FROM users WHERE email='$EMAIL_ADMIN';")"
expect_eq "promoted the admin user in the store-mysql container" "$ROLE" "ADMIN"

req POST "/auth/login" "{\"email\":\"$EMAIL_ADMIN\",\"password\":\"$PASS_A\"}"
expect_status "POST /auth/login as the admin is 200" 200
TOKEN_ADMIN="$(pyq "$BODY" "d['token']")"

req GET "/admin/hello"
expect_status "GET /admin/hello anonymous is 401" 401

req GET "/admin/hello" "" "$TOKEN_B"
expect_status "GET /admin/hello as a normal USER is 403" 403
# S6: the security layer's 403 now carries a JSON body.
expect_body_contains "S6: 403 from the security layer has a JSON error body" '"error": "Access denied."'
expect_header_contains "S6: 403 body is application/json" "^content-type: *application/json"

req GET "/admin/hello" "" "$TOKEN_ADMIN"
expect_status "GET /admin/hello as ADMIN is 200" 200
expect_body_contains "GET /admin/hello greets the admin" "Hello Admin!"

############################################################
section "Users - authenticated reads & writes (U3: owner-or-admin)"
############################################################
req GET "/users"
expect_status "GET /users without a token is 401" 401

# U3: listing every user is admin-only (UserSecurityRules).
req GET "/users" "" "$TOKEN_A"
expect_status "U3: GET /users as a normal USER is 403" 403
expect_body_contains "U3: GET /users 403 body" "Access denied."

req GET "/users" "" "$TOKEN_ADMIN"
expect_status "U3: GET /users as ADMIN is 200" 200
expect_eq "GET /users returns a non-empty list" "$(pyq "$BODY" "len(d) > 0")" "True"

req GET "/users?sort=email" "" "$TOKEN_ADMIN"
expect_status "GET /users?sort=email as ADMIN is 200" 200
expect_eq "GET /users?sort=email is sorted by e-mail" \
  "$(pyq "$BODY" "[u['email'] for u in d] == sorted(u['email'] for u in d)")" "True"

req GET "/users/$USER_A_ID" "" "$TOKEN_A"
expect_status "GET /users/{id} own account is 200" 200
expect_eq "GET /users/{id} returns the right user" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"

req GET "/users/$USER_B_ID" "" "$TOKEN_A"
expect_status "U3: GET /users/{id} of another user as USER is 403" 403
expect_body_contains "U3: ownership error message" "You don't have access to this user."

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "U3: GET /users/{id} of another user as ADMIN is 200" 200
expect_eq "U3: ADMIN sees the other user" "$(pyq "$BODY" "d['email']")" "$EMAIL_B"

# The access check runs before the lookup, so a USER gets 403 for any foreign id.
req GET "/users/999999" "" "$TOKEN_A"
expect_status "U3: GET /users/{id} unknown id as USER is 403" 403

req GET "/users/999999" "" "$TOKEN_ADMIN"
expect_status "GET /users/{id} unknown id as ADMIN is 404" 404

# --- PUT /users/{id} ---
req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"$EMAIL_A\"}" "$TOKEN_A"
expect_status "PUT /users/{id} with both fields is 200" 200
expect_eq "PUT /users/{id} applied the new name" "$(pyq "$BODY" "d['name']")" "Alice Updated"

# U4: a partial body is rejected instead of nulling the missing field.
req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Partial\"}" "$TOKEN_A"
expect_status "U4: PUT /users/{id} with only a name is 400" 400
expect_body_contains "U4: missing e-mail message" "Email is required"

req PUT "/users/$USER_A_ID" "{\"email\":\"$EMAIL_A\"}" "$TOKEN_A"
expect_status "U4: PUT /users/{id} with only an e-mail is 400" 400
expect_body_contains "U4: missing name message" "Name is required"

req GET "/users/$USER_A_ID" "" "$TOKEN_A"
expect_eq "U4: the rejected partial PUT changed nothing (name)" "$(pyq "$BODY" "d['name']")" "Alice Updated"
expect_eq "U4: the rejected partial PUT changed nothing (e-mail)" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"

req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"UPPER.$TS@Example.COM\"}" "$TOKEN_A"
expect_status "U4: PUT /users/{id} with an uppercase e-mail is 400" 400
expect_body_contains "U4: uppercase e-mail message" "Email must be in lowercase"

# U2: taking over another user's e-mail is rejected.
req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"$EMAIL_B\"}" "$TOKEN_A"
expect_status "U2: PUT /users/{id} to another user's e-mail is 400" 400
expect_body_contains "U2: duplicate e-mail message on update" "Email is already registered."

req PUT "/users/$USER_B_ID" "{\"name\":\"Bob Hijacked\",\"email\":\"$EMAIL_B\"}" "$TOKEN_A"
expect_status "U3: PUT /users/{id} of another user as USER is 403" 403
expect_body_contains "U3: PUT ownership error message" "You don't have access to this user."

req PUT "/users/$USER_B_ID" "{\"name\":\"Bob Renamed\",\"email\":\"$EMAIL_B\"}" "$TOKEN_ADMIN"
expect_status "U3: PUT /users/{id} of another user as ADMIN is 200" 200
expect_eq "U3: ADMIN update applied" "$(pyq "$BODY" "d['name']")" "Bob Renamed"

# --- POST /users/{id}/change-password ---
NEW_PASS_A="newsecret123"
NEW_PASS_B="adminset123"

req POST "/users/$USER_A_ID/change-password" \
  "{\"oldPassword\":\"definitely-wrong\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "POST /users/{id}/change-password wrong old password is 401 (course behaviour kept)" 401

# U1: the request is validated.
req POST "/users/$USER_A_ID/change-password" "{\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "U1: change-password without oldPassword is 400" 400
expect_body_contains "U1: missing oldPassword message" "Old password is required."

req POST "/users/$USER_A_ID/change-password" "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"abc\"}" "$TOKEN_A"
expect_status "U1: change-password with a 3-char newPassword is 400" 400
expect_body_contains "U1: short newPassword message" "Password must be between 6 to 25 characters long."

req POST "/users/$USER_A_ID/change-password" "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"\"}" "$TOKEN_A"
expect_status "U1: change-password with a blank newPassword is 400" 400
expect_body_contains "U1: blank newPassword is reported on the newPassword field" '"newPassword"'

req POST "/users/$USER_B_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "U3: change-password on another user's account as USER is 403" 403
expect_body_contains "U3: change-password ownership error message" "You don't have access to this user."

req POST "/users/$USER_A_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "POST /users/{id}/change-password correct old password is 200" 200

# U1: the new password is stored as a BCrypt hash (the course stored it in plaintext).
PW_PREFIX="$(MYSQLQ "SELECT LEFT(password, 4) FROM users WHERE id = $USER_A_ID;")"
expect_eq "U1: change-password stores a BCrypt hash (LEFT(password,4))" "$PW_PREFIX" '$2a$'

req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"$NEW_PASS_A\"}"
expect_status "U1: login with the NEW password after change-password is 200" 200

req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}"
expect_status "U1: login with the OLD password after change-password is 401" 401

req POST "/users/$USER_B_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_B\"}" "$TOKEN_ADMIN"
expect_status "U3: change-password on another user's account as ADMIN is 200" 200

req POST "/auth/login" "{\"email\":\"$EMAIL_B\",\"password\":\"$NEW_PASS_B\"}"
expect_status "U1/U3: the admin-set password works for the other user" 200
TOKEN_B="$(pyq "$BODY" "d['token']")"

############################################################
section "Products - admin-only writes"
############################################################
NEW_PRODUCT="{\"name\":\"Smoke Widget $TS\",\"price\":12.50,\"description\":\"smoke test product\",\"categoryId\":1}"

req POST "/products" "$NEW_PRODUCT"
expect_status "POST /products without a token is 401" 401

req POST "/products" "$NEW_PRODUCT" "$TOKEN_B"
expect_status "POST /products as a normal USER is 403" 403
expect_body_contains "S6: POST /products 403 body" "Access denied."

req PUT "/products/$P1_ID" "$NEW_PRODUCT" "$TOKEN_B"
expect_status "PUT /products/{id} as a normal USER is 403" 403

req DELETE "/products/$P1_ID" "" "$TOKEN_B"
expect_status "DELETE /products/{id} as a normal USER is 403" 403

req POST "/products" "$NEW_PRODUCT" "$TOKEN_ADMIN"
expect_status "POST /products as ADMIN is 201" 201
NEW_PRODUCT_ID="$(pyq "$BODY" "d['id']")"
if printf '%s' "$HDRS" | grep -qi "^location:.*/products/$NEW_PRODUCT_ID"; then
  ok "POST /products sets Location: /products/$NEW_PRODUCT_ID"
else
  bad "POST /products sets Location header" "no matching Location in response headers"
fi

# P1: product input is validated (used to store anything, or 500 on nulls).
req POST "/products" '{}' "$TOKEN_ADMIN"
expect_status "P1: POST /products with an empty body is 400" 400
expect_eq "P1: one message per missing field" "$(pyq "$BODY" "sorted(d.keys())")" "['categoryId', 'description', 'name', 'price']"
expect_body_contains "P1: name message" "Name is required."
expect_body_contains "P1: description message" "Description is required."
expect_body_contains "P1: price message" "Price is required."
expect_body_contains "P1: categoryId message" "Category ID is required."

req POST "/products" "{\"name\":\"Negative $TS\",\"price\":-1.00,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "P1: POST /products with a negative price is 400" 400
expect_body_contains "P1: negative price message" "Price must be greater than zero."

req POST "/products" "{\"name\":\"Zero $TS\",\"price\":0,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "P1: POST /products with price 0 is 400" 400

req POST "/products" "{\"name\":\"Decimals $TS\",\"price\":9.999,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "P1: POST /products with 3 decimals is 400" 400
expect_body_contains "P1: decimals message" "Price must have at most 2 decimals."

req POST "/products" "{\"name\":\"Bad Category\",\"price\":1.00,\"description\":\"x\",\"categoryId\":99}" "$TOKEN_ADMIN"
expect_status "POST /products with an unknown categoryId is 400 (course behaviour kept)" 400

req PUT "/products/$NEW_PRODUCT_ID" \
  "{\"name\":\"\",\"price\":19.99,\"description\":\"updated\",\"categoryId\":2}" "$TOKEN_ADMIN"
expect_status "P1: PUT /products/{id} with a blank name is 400" 400
expect_body_contains "P1: PUT blank name message" "Name is required."

req PUT "/products/$NEW_PRODUCT_ID" \
  "{\"name\":\"Smoke Widget Updated\",\"price\":19.99,\"description\":\"updated\",\"categoryId\":2}" "$TOKEN_ADMIN"
expect_status "PUT /products/{id} as ADMIN is 200" 200
expect_eq "PUT /products/{id} applied the new name" "$(pyq "$BODY" "d['name']")" "Smoke Widget Updated"

req GET "/products/$NEW_PRODUCT_ID"
expect_eq "GET /products/{id} reflects the update" "$(pyq "$BODY" "d['name']")" "Smoke Widget Updated"

req DELETE "/products/$NEW_PRODUCT_ID" "" "$TOKEN_ADMIN"
expect_status "DELETE /products/{id} (unreferenced) as ADMIN is 204" 204

req GET "/products/$NEW_PRODUCT_ID"
expect_status "GET /products/{id} after delete is 404" 404

# P2: a product that belongs to an order cannot be deleted (409 instead of a crash).
req POST "/products" "{\"name\":\"Ordered Widget $TS\",\"price\":5.00,\"description\":\"referenced by an order\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products creates the product to be ordered" 201
ORDERED_PRODUCT_ID="$(pyq "$BODY" "d['id']")"

# Seed an order for user A directly in the container (also used by the Orders section).
ORDER_ID="$(MYSQLQ "INSERT INTO orders (customer_id, status, total_price) VALUES ($USER_A_ID, 'PENDING', 10.00); SELECT LAST_INSERT_ID();")"
MYSQLQ "INSERT INTO order_items (order_id, product_id, unit_price, quantity, total_price) VALUES ($ORDER_ID, $ORDERED_PRODUCT_ID, 5.00, 2, 10.00);" >/dev/null
if [ -n "$ORDER_ID" ]; then
  ok "seeded order $ORDER_ID for user A in the store-mysql container"
else
  bad "seeded order for user A" "no order id returned from MySQL"
fi

req DELETE "/products/$ORDERED_PRODUCT_ID" "" "$TOKEN_ADMIN"
expect_status "P2: DELETE /products/{id} referenced by an order is 409" 409
expect_body_contains "P2: 409 error body" "Product is referenced by existing orders and cannot be deleted."

req GET "/products/$ORDERED_PRODUCT_ID"
expect_status "P2: the ordered product still exists after the rejected delete" 200

############################################################
section "Carts - anonymous (CartSecurityRules: /carts/** permitAll)"
############################################################
req POST "/carts"
expect_status "POST /carts is 201" 201
CART_ID="$(pyq "$BODY" "d['id']")"
expect_eq "POST /carts starts empty" "$(pyq "$BODY" "len(d['items']) == 0")" "True"
expect_eq "POST /carts starts at totalPrice 0" "$(pyq "$BODY" "float(d['totalPrice']) == 0.0")" "True"
if printf '%s' "$HDRS" | grep -qi "^location:.*/carts/$CART_ID"; then
  ok "POST /carts sets Location: /carts/$CART_ID"
else
  bad "POST /carts sets Location header" "no matching Location in response headers"
fi

req POST "/carts/$CART_ID/items" "{\"productId\":$P1_ID}"
expect_status "POST /carts/{id}/items is 201" 201
expect_eq "first add sets quantity 1" "$(pyq "$BODY" "d['quantity']")" "1"

req POST "/carts/$CART_ID/items" "{\"productId\":$P1_ID}"
expect_status "POST /carts/{id}/items again is 201" 201
expect_eq "re-adding the same product increments quantity to 2" "$(pyq "$BODY" "d['quantity']")" "2"

req POST "/carts/$CART_ID/items" "{\"productId\":999999}"
expect_status "POST /carts/{id}/items unknown product is 400" 400
expect_body_contains "unknown product message" "Product not found."

# C1: a missing productId is a validation error, not a 500.
req POST "/carts/$CART_ID/items" '{}'
expect_status "C1: POST /carts/{id}/items with an empty body is 400" 400
expect_body_contains "C1: missing productId message" "Product ID is required."

req POST "/carts/$CART_ID/items" '{"productId":null}'
expect_status "C1: POST /carts/{id}/items with productId null is 400" 400

req POST "/carts/00000000-0000-0000-0000-000000000000/items" "{\"productId\":$P1_ID}"
expect_status "POST /carts/{unknown-uuid}/items is 404" 404
expect_body_contains "unknown cart message" "Cart not found."

req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":3}'
expect_status "PUT quantity=3 is 200" 200
expect_eq "PUT quantity=3 applied" "$(pyq "$BODY" "d['quantity']")" "3"

req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":0}'
expect_status "PUT quantity=0 is 400 (@Min(1))" 400
expect_body_contains "quantity=0 message" "Quantity must be greater than zero."

req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":101}'
expect_status "PUT quantity=101 is 200 (@Max is 1000)" 200

# C2: the @Max message now matches the limit.
req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":1001}'
expect_status "PUT quantity=1001 is 400 (@Max(1000))" 400
expect_body_contains "C2: @Max message says 1000" "Quantity must be less than or equal to 1000."

req PUT "/carts/$CART_ID/items/$P1_ID" '{}'
expect_status "PUT with no quantity is 400 (@NotNull)" 400
expect_body_contains "missing quantity message" "Quantity must be provided."

req PUT "/carts/$CART_ID/items/999999" '{"quantity":2}'
expect_status "PUT for a product not in the cart is 400" 400
expect_body_contains "product-not-in-cart message" "Product not found."

# Put the cart into a known state, add a second product, verify the arithmetic.
req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":3}'
req POST "/carts/$CART_ID/items" "{\"productId\":$P2_ID}"
req GET "/carts/$CART_ID"
expect_status "GET /carts/{id} is 200" 200
expect_eq "GET /carts/{id} has 2 line items" "$(pyq "$BODY" "len(d['items'])")" "2"
expect_eq "each item totalPrice == price * quantity" \
  "$(pyq "$BODY" "all(abs(float(i['totalPrice']) - float(i['product']['price']) * i['quantity']) < 1e-9 for i in d['items'])")" "True"
expect_eq "cart totalPrice == sum of item totals" \
  "$(pyq "$BODY" "abs(float(d['totalPrice']) - sum(float(i['product']['price']) * i['quantity'] for i in d['items'])) < 1e-9")" "True"

req DELETE "/carts/$CART_ID/items/$P2_ID"
expect_status "DELETE /carts/{id}/items/{productId} is 204" 204
req GET "/carts/$CART_ID"
expect_eq "removed item is gone" "$(pyq "$BODY" "len(d['items'])")" "1"

req DELETE "/carts/$CART_ID/items"
expect_status "DELETE /carts/{id}/items (clear) is 204" 204
req GET "/carts/$CART_ID"
expect_eq "cleared cart has no items" "$(pyq "$BODY" "len(d['items'])")" "0"
expect_eq "cleared cart totalPrice is 0" "$(pyq "$BODY" "float(d['totalPrice']) == 0.0")" "True"

req GET "/carts/00000000-0000-0000-0000-000000000000"
expect_status "GET /carts/{unknown-uuid} is 404" 404
expect_body_contains "unknown cart body" "Cart not found."

# S1: a malformed UUID is a 400 with an error body (used to be a blank 401).
req GET "/carts/not-a-uuid"
expect_status "S1: GET /carts/not-a-uuid is 400" 400
expect_body_contains "S1: malformed UUID error body" "Invalid request parameter."

############################################################
section "Checkout (STRIPE_SECRET_KEY is empty in .env)"
############################################################
req POST "/checkout" "{\"cartId\":\"$CART_ID\"}"
expect_status "POST /checkout without a token is 401" 401

req POST "/checkout" '{"cartId":"00000000-0000-0000-0000-000000000000"}' "$TOKEN_B"
expect_status "POST /checkout with an unknown cart is 400" 400
expect_body_contains "unknown cart message" "Cart not found"

# $CART_ID was just cleared, so it is empty.
req POST "/checkout" "{\"cartId\":\"$CART_ID\"}" "$TOKEN_B"
expect_status "POST /checkout with an empty cart is 400" 400
expect_body_contains "empty cart message" "Cart is empty"

req POST "/checkout" '{}' "$TOKEN_B"
expect_status "POST /checkout without a cartId is 400 (@NotNull)" 400
expect_body_contains "missing cartId message" "Cart ID is required."

# A cart with items: Stripe rejects the empty API key, the gateway throws
# PaymentException, CheckoutService deletes the PENDING order and rethrows.
req GET "/orders" "" "$TOKEN_B"
ORDERS_BEFORE="$(pyq "$BODY" "len(d)")"

req POST "/carts"
CART_PAY="$(pyq "$BODY" "d['id']")"
req POST "/carts/$CART_PAY/items" "{\"productId\":$P1_ID}"

req POST "/checkout" "{\"cartId\":\"$CART_PAY\"}" "$TOKEN_B"
expect_status "POST /checkout with items and no Stripe key is 500" 500
expect_body_contains "checkout failure message" "Error creating a checkout session"

req GET "/orders" "" "$TOKEN_B"
expect_eq "the failed checkout left no order behind" "$(pyq "$BODY" "len(d)")" "$ORDERS_BEFORE"

req GET "/carts/$CART_PAY"
expect_eq "the failed checkout did not clear the cart" "$(pyq "$BODY" "len(d['items'])")" "1"

############################################################
section "Orders"
############################################################
req GET "/orders"
expect_status "GET /orders without a token is 401" 401

req GET "/orders" "" "$TOKEN_A"
expect_status "GET /orders with a token is 200" 200
expect_eq "GET /orders returns a list" "$(pyq "$BODY" "isinstance(d, list)")" "True"

req GET "/orders/999999" "" "$TOKEN_A"
expect_status "GET /orders/{id} unknown id is 404" 404

req GET "/orders/$ORDER_ID" "" "$TOKEN_A"
expect_status "GET /orders/{id} as the owner is 200" 200
expect_eq "the order carries its line items" "$(pyq "$BODY" "len(d['items']) == 1")" "True"
expect_eq "the line item carries its product" "$(pyq "$BODY" "d['items'][0]['product']['id']")" "$ORDERED_PRODUCT_ID"
expect_eq "the order status is PENDING" "$(pyq "$BODY" "d['status']")" "PENDING"

req GET "/orders" "" "$TOKEN_A"
expect_eq "GET /orders lists the owner's order" \
  "$(pyq "$BODY" "any(o['id'] == $ORDER_ID for o in d)")" "True"

req GET "/orders/$ORDER_ID" "" "$TOKEN_B"
expect_status "GET /orders/{id} as a different user is 403" 403
expect_body_contains "ownership error message" "You don't have access to this order."

req GET "/orders" "" "$TOKEN_B"
expect_eq "GET /orders does not leak the other user's order" \
  "$(pyq "$BODY" "any(o['id'] == $ORDER_ID for o in d)")" "False"

############################################################
section "Stripe webhook"
############################################################
STATUS_BEFORE="$(MYSQLQ "SELECT status FROM orders WHERE id = $ORDER_ID;")"

req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}' "" \
  "stripe-signature: t=1,v1=deadbeef"
expect_status "POST /checkout/webhook with a bogus signature is 500 (course behaviour kept)" 500
expect_body_contains "webhook failure message" "Error creating a checkout session"

# W1: a missing stripe-signature header is rejected before stripe-java can NPE.
req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}'
expect_status "W1: POST /checkout/webhook without a stripe-signature header is 400" 400
expect_body_contains "W1: missing signature error body" "Missing stripe-signature header."

# curl's "name;" syntax sends the header with an empty value.
req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}' "" "stripe-signature;"
expect_status "W1: POST /checkout/webhook with a blank stripe-signature header is 400" 400

STATUS_AFTER="$(MYSQLQ "SELECT status FROM orders WHERE id = $ORDER_ID;")"
expect_eq "a rejected webhook did not change the order status" "$STATUS_AFTER" "$STATUS_BEFORE"

############################################################
section "Users - delete (U3: owner-or-admin)"
############################################################
req DELETE "/users/$USER_B_ID" "" "$TOKEN_A"
expect_status "U3: DELETE /users/{id} of another user as USER is 403" 403
expect_body_contains "U3: DELETE ownership error message" "You don't have access to this user."

req DELETE "/users/999999" "" "$TOKEN_A"
expect_status "U3: DELETE /users/{id} unknown id as USER is 403" 403

req DELETE "/users/999999" "" "$TOKEN_ADMIN"
expect_status "DELETE /users/{id} unknown id as ADMIN is 404" 404

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "user B still exists before the self-delete" 200

req DELETE "/users/$USER_B_ID" "" "$TOKEN_B"
expect_status "DELETE /users/{id} own account is 200" 200

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "GET /users/{id} after delete as ADMIN is 404" 404

# A still-valid token for a deleted account no longer NPEs (403 from the access check).
req GET "/users/$USER_B_ID" "" "$TOKEN_B"
expect_status "U3: GET /users/{id} with the deleted user's own token is 403" 403
expect_body_contains "U3: deleted-user error message" "You don't have access to this user."

############################################################
section "Round-1 fixes (regression guards)"
############################################################
# --- CFG-3: SecurityConfig rebuilt on the Spring Security 6.5 API ---
# `new DaoAuthenticationProvider()` + setUserDetailsService() are deprecated for
# removal in the 6.5.x that Boot 3.5.16 manages, so the provider is now built as
# `new DaoAuthenticationProvider(userDetailsService)`. That is the whole change;
# authentication behaviour must stay exactly what the course produces. These
# checks exercise every branch of the provider the rewiring could have broken.
EMAIL_FIX="fix.$TS@example.com"
req POST "/users" "{\"name\":\"Fix $TS\",\"email\":\"$EMAIL_FIX\",\"password\":\"$PASS_A\"}"
expect_status "CFG-3: registered a probe user" 201

req POST "/auth/login" "{\"email\":\"$EMAIL_FIX\",\"password\":\"$PASS_A\"}"
expect_status "CFG-3: correct credentials still 200 (constructor-injected UserDetailsService resolves the user)" 200
expect_eq "CFG-3: login still returns a JWT" "$(pyq "$BODY" "d['token'].startswith('ey')")" "True"

req POST "/auth/login" "{\"email\":\"$EMAIL_FIX\",\"password\":\"wrong-password\"}"
expect_status "CFG-3: wrong password still 401 (PasswordEncoder still wired into the provider)" 401

# The unknown-e-mail branch runs entirely inside the UserDetailsService that the
# constructor now receives, so it is the sharpest check on the rewiring.
req POST "/auth/login" "{\"email\":\"nobody.$TS@example.com\",\"password\":\"$PASS_A\"}"
expect_status "CFG-3: unknown e-mail still 401 (UserDetailsService lookup path)" 401

# Registration must still BCrypt-hash, i.e. the encoder is still on the provider.
PW_HASH="$(MYSQLQ "SELECT password FROM users WHERE email='$EMAIL_FIX';")"
case "$PW_HASH" in
  '$2a$'*|'$2b$'*|'$2y$'*) ok "CFG-3: registration still stores a BCrypt hash (${PW_HASH:0:4}...)" ;;
  *) bad "CFG-3: registration still stores a BCrypt hash" "expected a bcrypt hash, got '${PW_HASH:0:20}'" ;;
esac

# --- CFG-1: flyway-maven-plugin must not aim at the protected 3306 service ---
# The course hardcodes jdbc:mysql://localhost:3306 with cleanDisabled=false. On
# this machine 3306 is the user's own MySQL Windows service, which must never be
# touched; the dev database is the store-mysql container on 3307.
PROJECT_DIR="${PROJECT_DIR:-C:/Users/Dell G15/Desktop/New/spring-api-starter}"
if [ -f "$PROJECT_DIR/pom.xml" ]; then
  FLYWAY_URL="$(sed -n '/<artifactId>flyway-maven-plugin<\/artifactId>/,/<\/plugin>/p' "$PROJECT_DIR/pom.xml" \
                | grep -o '<url>[^<]*</url>' | head -1)"
  case "$FLYWAY_URL" in
    *localhost:3306*) bad "CFG-1: flyway-maven-plugin avoids the protected 3306 service" \
                          "pom.xml still has $FLYWAY_URL" ;;
    *localhost:3307*) ok  "CFG-1: flyway-maven-plugin targets the 3307 dev container, not 3306" ;;
    "")               bad "CFG-1: flyway-maven-plugin url is readable" "no <url> in the plugin block" ;;
    *)                bad "CFG-1: flyway-maven-plugin targets the 3307 dev container" "unexpected url: $FLYWAY_URL" ;;
  esac
else
  bad "CFG-1: pom.xml is readable" "not found at $PROJECT_DIR/pom.xml"
fi

# The app's own datasource must likewise be the container: prove the rows this
# test has been asserting against all along live in store-mysql on 3307.
CONTAINER_HAS_USER="$(MYSQLQ "SELECT count(*) FROM users WHERE email='$EMAIL_FIX';")"
expect_eq "CFG-1: the running app writes to the store-mysql container (3307), not 3306" "$CONTAINER_HAS_USER" "1"

############################################################
section "Round-2 fixes (regression guards)"
############################################################
# --- RT1-1: the DOCUMENTED setup path must not aim at the protected 3306 ---
# README step 2 says "rename .env.example to .env". That file used to ship the
# DB_* block commented out, so the resulting .env had no DB_URL and the app fell
# back to application-dev.yaml's course default of localhost:3306 -- the user's
# own MySQL Windows service. Both the example file and the fallback now name the
# store-mysql container on 3307.
ENV_EXAMPLE="$PROJECT_DIR/.env.example"
DEV_YAML="$PROJECT_DIR/src/main/resources/application-dev.yaml"

if [ -f "$ENV_EXAMPLE" ]; then
  # Only uncommented assignments count -- that is what dotenv would read.
  ENV_DB_URL="$(grep -E '^[[:space:]]*DB_URL=' "$ENV_EXAMPLE" | head -1 | cut -d= -f2- | tr -d '\r')"
  case "$ENV_DB_URL" in
    *localhost:3307*) ok "RT1-1: .env.example ships an active DB_URL on 3307 ($ENV_DB_URL)" ;;
    *localhost:3306*) bad "RT1-1: .env.example DB_URL avoids 3306" "it is $ENV_DB_URL" ;;
    "")               bad "RT1-1: .env.example ships an active DB_URL" \
                          "no uncommented DB_URL= line, so renaming it per README step 2 yields a .env that falls through to the default" ;;
    *)                bad "RT1-1: .env.example DB_URL targets the dev container" "unexpected value: $ENV_DB_URL" ;;
  esac

  for v in DB_USERNAME DB_PASSWORD; do
    if grep -qE "^[[:space:]]*$v=" "$ENV_EXAMPLE"; then
      ok "RT1-1: .env.example ships an active $v"
    else
      bad "RT1-1: .env.example ships an active $v" "no uncommented $v= line"
    fi
  done

  # Docs slice: JWT_SECRET is documented as required, right above the key.
  if grep -B1 -E '^JWT_SECRET=' "$ENV_EXAMPLE" | grep -q 'openssl rand -base64 32'; then
    ok "docs: .env.example documents how to generate JWT_SECRET above the key"
  else
    bad "docs: .env.example documents how to generate JWT_SECRET" "no 'openssl rand -base64 32' comment above JWT_SECRET="
  fi
else
  bad "RT1-1: .env.example is readable" "not found at $ENV_EXAMPLE"
fi

if [ -f "$DEV_YAML" ]; then
  YAML_DEFAULT="$(grep -o '\${DB_URL:[^}]*}' "$DEV_YAML" | head -1)"
  case "$YAML_DEFAULT" in
    *localhost:3307*) ok "RT1-1: application-dev.yaml falls back to 3307 when DB_URL is unset" ;;
    *localhost:3306*) bad "RT1-1: application-dev.yaml fallback avoids 3306" \
                          "a missing .env would point the app at the protected service: $YAML_DEFAULT" ;;
    "")               bad "RT1-1: application-dev.yaml keeps the \${DB_URL:...} placeholder" "not found" ;;
    *)                bad "RT1-1: application-dev.yaml fallback targets the dev container" "unexpected: $YAML_DEFAULT" ;;
  esac
else
  bad "RT1-1: application-dev.yaml is readable" "not found at $DEV_YAML"
fi

# Belt and braces: no active (uncommented) 3306 reference is left in the config
# the app or the build reads.
LIVE_3306="$(grep -nE 'localhost:3306' "$ENV_EXAMPLE" "$DEV_YAML" "$PROJECT_DIR/src/main/resources/application.yaml" "$PROJECT_DIR/pom.xml" 2>/dev/null \
             | grep -vE ':[[:space:]]*#|<!--|^[^:]*:[0-9]+:[[:space:]]*#' | grep -v 'course' || true)"
if [ -z "$LIVE_3306" ]; then
  ok "RT1-1: no active localhost:3306 left in .env.example, application*.yaml or pom.xml"
else
  bad "RT1-1: no active localhost:3306 in config" "still present: $(printf '%s' "$LIVE_3306" | head -3)"
fi

# --- RT1-3: flyway-maven-plugin must actually run on this stack ---
# The course pins the plugin to 10.15.0. Boot 3.5.16 puts flyway-core 11.7.2 on
# the plugin's realm, where FlywayTelemetryManager is an interface rather than a
# class, so every goal died with IncompatibleClassChangeError before reaching a
# database -- which also made the README's claim about flyway:info untrue.
if grep -A3 '<artifactId>flyway-maven-plugin</artifactId>' "$PROJECT_DIR/pom.xml" | grep -q '<version>10\.'; then
  bad "RT1-3: flyway-maven-plugin is not pinned to a Flyway 10 version" \
      "pom.xml still pins a 10.x plugin against the Boot-managed flyway-core 11.7.2"
else
  ok "RT1-3: flyway-maven-plugin is no longer pinned to a Flyway 10 version"
fi

FLYWAY_OUT="$(cd "$PROJECT_DIR" && mvn -B -o flyway:info 2>&1)"
case "$FLYWAY_OUT" in
  *IncompatibleClassChangeError*)
    bad "RT1-3: mvn flyway:info runs" "still fails with IncompatibleClassChangeError" ;;
  *"BUILD SUCCESS"*)
    ok "RT1-3: mvn flyway:info runs to BUILD SUCCESS on this stack" ;;
  *)
    bad "RT1-3: mvn flyway:info runs" "no BUILD SUCCESS; tail: $(printf '%s' "$FLYWAY_OUT" | grep -E '^\[ERROR\]' | head -2)" ;;
esac

case "$FLYWAY_OUT" in
  *"flyway:11."*) ok "RT1-3: the plugin resolves to Flyway 11.x, matching the runtime flyway-core" ;;
  *) bad "RT1-3: the plugin resolves to Flyway 11.x" \
         "goal line was: $(printf '%s' "$FLYWAY_OUT" | grep -o -- '--- flyway:[^ ]*' | head -1)" ;;
esac

case "$FLYWAY_OUT" in
  *"jdbc:mysql://localhost:3307/store_api"*)
    ok "RT1-3: flyway:info really reaches the 3307 dev container (README claim is now true)" ;;
  *localhost:3306*)
    bad "RT1-3: flyway:info targets the dev container" "it reported a 3306 database" ;;
  *)
    bad "RT1-3: flyway:info targets the dev container" \
        "no Database: line for localhost:3307 in the output" ;;
esac

# The goal must see the schema this test has been exercising, i.e. it is pointed
# at the same database the app writes to. V6 (users_email_unique) is the newest.
case "$FLYWAY_OUT" in
  *"Schema version: 6"*) ok "RT1-3: flyway:info reports schema version 6 (V1-V6 applied)" ;;
  *) bad "RT1-3: flyway:info reports schema version 6" \
         "got: $(printf '%s' "$FLYWAY_OUT" | grep -i 'Schema version' | head -1)" ;;
esac

############################################################
section "Round-3 fixes (regression guards)"
############################################################
# --- AT-1 / SC-1: refresh token of a deleted user is 401, not 500 ---
# AuthService.refreshAccessToken used the course's bare orElseThrow(); once the
# /error dispatch was permitted (S1) the NoSuchElementException became a 500
# with a stack trace. It now throws BadCredentialsException -> 401 like every
# other invalid refresh token.
EMAIL_GONE="gone.$TS@example.com"
req POST "/users" "{\"name\":\"Gone $TS\",\"email\":\"$EMAIL_GONE\",\"password\":\"$PASS_A\"}"
expect_status "AT-1: registered a user that will delete itself" 201
USER_GONE_ID="$(pyq "$BODY" "d['id']")"

req POST "/auth/login" "{\"email\":\"$EMAIL_GONE\",\"password\":\"$PASS_A\"}"
expect_status "AT-1: logged in as that user" 200
TOKEN_GONE="$(pyq "$BODY" "d['token']")"
REFRESH_GONE="$(printf '%s' "$HDRS" | grep -i '^set-cookie: *refreshToken=' | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r')"

req DELETE "/users/$USER_GONE_ID" "" "$TOKEN_GONE"
expect_status "AT-1: the user deleted its own account" 200

req POST "/auth/refresh" "" "" "Cookie: refreshToken=$REFRESH_GONE"
expect_status "AT-1: POST /auth/refresh with the deleted user's refresh token is 401 (was 500)" 401
expect_body_empty "AT-1: the 401 has no body (AuthController's BadCredentialsException handler)"

# --- SC-2: the security layer's 403 body is labelled UTF-8 ---
req GET "/admin/hello" "" "$TOKEN_A"
expect_status "SC-2: GET /admin/hello as USER is still 403" 403
expect_header_contains "SC-2: 403 Content-Type is application/json;charset=UTF-8 (was ISO-8859-1)" \
  "^content-type: *application/json; *charset=utf-8"

# --- AT-3: HEAD /users is admin-only like GET ---
head_req "/users"
expect_status "AT-3: HEAD /users anonymous is 401" 401
head_req "/users" "$TOKEN_A"
expect_status "AT-3: HEAD /users as a normal USER is 403 (was 200)" 403
head_req "/users" "$TOKEN_ADMIN"
expect_status "AT-3: HEAD /users as ADMIN is 200" 200

# --- AT-2: feature error handlers write JSON even when Accept excludes JSON ---
# The handlers preset Content-Type: application/json, so a text/html or xml
# Accept header no longer turns a 400/403/404 into a 500 Whitelabel page.
req GET "/carts/00000000-0000-0000-0000-000000000000" "" "" "Accept: text/html"
expect_status "AT-2: GET /carts/{unknown} with Accept: text/html is 404 (was 500)" 404
expect_body_contains "AT-2: ... and carries the JSON error body" "Cart not found."
expect_header_contains "AT-2: ... as application/json" "^content-type: *application/json"

req POST "/carts/00000000-0000-0000-0000-000000000000/items" "{\"productId\":$P1_ID}" "" "Accept: application/xml"
expect_status "AT-2: POST /carts/{unknown}/items with Accept: application/xml is 404 (was 500)" 404
expect_body_contains "AT-2: ... with the JSON error body" "Cart not found."

req POST "/carts/$CART_ID/items" '{"productId":999999}' "" "Accept: text/html"
expect_status "AT-2: unknown product with Accept: text/html is 400 (was 500)" 400
expect_body_contains "AT-2: ... with the JSON error body" "Product not found."

req POST "/users" "{\"name\":\"Alice again\",\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}" "" "Accept: text/html"
expect_status "AT-2: POST /users duplicate e-mail with Accept: text/html is 400 (was 500)" 400
expect_body_contains "AT-2: ... with the JSON error body" "Email is already registered."

req GET "/users/999999" "" "$TOKEN_A" "Accept: text/html"
expect_status "AT-2: GET /users/{foreign} as USER with Accept: text/html is 403 (was 500)" 403
expect_body_contains "AT-2: ... with the JSON error body" "You don't have access to this user."

req GET "/orders/$ORDER_ID" "" "$TOKEN_ADMIN" "Accept: text/html"
expect_status "AT-2: GET /orders/{id} of another user with Accept: text/html is 403 (was 500)" 403
expect_body_contains "AT-2: ... with the JSON error body" "You don't have access to this order."

req POST "/checkout" '{"cartId":"00000000-0000-0000-0000-000000000000"}' "$TOKEN_A" "Accept: text/html"
expect_status "AT-2: POST /checkout unknown cart with Accept: text/html is 400 (was 500)" 400
expect_body_contains "AT-2: ... with the JSON error body" "Cart not found"

# Sanity: a successful response still honours Accept (S1's 406 is untouched).
req GET "/products" "" "" "Accept: text/html"
expect_status "AT-2: GET /products with Accept: text/html is still 406" 406

# --- AT-4: POST /products ignores an id in the body ---
# ProductMapper.toEntity copied the id, so save() merged into the existing row.
req GET "/products/$P1_ID"
P1_NAME_BEFORE="$(pyq "$BODY" "d['name']")"
req POST "/products" "{\"id\":$P1_ID,\"name\":\"IdInjected $TS\",\"price\":1.00,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "AT-4: POST /products with an existing id in the body is 201" 201
INJECTED_ID="$(pyq "$BODY" "d['id']")"
if [ -n "$INJECTED_ID" ] && [ "$INJECTED_ID" != "$P1_ID" ] && [ "$INJECTED_ID" != "__PARSE_ERROR__" ]; then
  ok "AT-4: the body id was ignored, a new product $INJECTED_ID was created (not $P1_ID)"
else
  bad "AT-4: the body id was ignored" "response id is '$INJECTED_ID', request said $P1_ID"
fi
req GET "/products/$P1_ID"
expect_eq "AT-4: product $P1_ID is untouched" "$(pyq "$BODY" "d['name']")" "$P1_NAME_BEFORE"
if [ -n "$INJECTED_ID" ] && [ "$INJECTED_ID" != "$P1_ID" ] && [ "$INJECTED_ID" != "__PARSE_ERROR__" ]; then
  req DELETE "/products/$INJECTED_ID" "" "$TOKEN_ADMIN"
  expect_status "AT-4: cleanup of the created product" 204
fi

# --- AT-5: the filter only accepts tokens explicitly typed "access" ---
# Jwt.isAccessToken() is a positive check, so a correctly signed token without
# a type claim (as minted by builds before S2) or with any other value is 401.
NOW="$(date +%s)"; EXP=$((NOW + 600))
TOKEN_TYPED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"type\":\"access\",\"iat\":$NOW,\"exp\":$EXP}")"
if [ -z "$TOKEN_TYPED" ]; then
  bad "AT-5: minted test tokens" "no JWT_SECRET readable from $PROJECT_DIR/.env"
else
  req GET "/auth/me" "" "$TOKEN_TYPED"
  expect_status "AT-5: control - a locally signed token typed 'access' is accepted" 200
  expect_eq "AT-5: control - it resolves to user A" "$(pyq "$BODY" "d['id']")" "$USER_A_ID"

  TOKEN_UNTYPED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"iat\":$NOW,\"exp\":$EXP}")"
  req GET "/auth/me" "" "$TOKEN_UNTYPED"
  expect_status "AT-5: a signed token WITHOUT a type claim is 401 (was 200)" 401

  TOKEN_MISCASED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"type\":\"Refresh\",\"iat\":$NOW,\"exp\":$EXP}")"
  req GET "/auth/me" "" "$TOKEN_MISCASED"
  expect_status "AT-5: a signed token typed 'Refresh' is 401 (was 200)" 401

  req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_UNTYPED"
  expect_status "AT-5: an untyped token as the refresh cookie is still 401" 401
  req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_TYPED"
  expect_status "AT-5: an access-typed token as the refresh cookie is still 401" 401
fi

############################################################
printf '\n=========================================\n'
printf 'PASSED: %d   FAILED: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFailed checks:\n'
  for n in "${FAILED_NAMES[@]}"; do printf '  - %s\n' "$n"; done
  exit 1
fi
printf 'All checks passed.\n'
exit 0
