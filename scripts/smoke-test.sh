#!/usr/bin/env bash
# End-to-end checks against a running instance of the API.
#
# Usage: BASE_URL=http://localhost:8080 bash scripts/smoke-test.sh
#   SMOKE_ADMIN_EMAIL  an e-mail listed in ADMIN_EMAILS on the server; enables the admin bootstrap checks
#   SMOKE_ENV_FILE     .env whose JWT_SECRET signs the test tokens (default: .env in the project root)
#
# Needs curl, Python and Docker (database checks run in the store-mysql container).
# Exits non-zero if any check fails.

BASE_URL="${BASE_URL:-http://localhost:8080}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TS="$(date +%s)$$"
TMP="$(mktemp -d)"
BOOT_ID=""
BOOT_TOKEN=""
cleanup() {
  if [ -n "$BOOT_ID" ] && [ -n "$BOOT_TOKEN" ]; then
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $BOOT_TOKEN" "$BASE_URL/users/$BOOT_ID"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

PASS=0
FAIL=0
FAILED_NAMES=()

ok()  { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); printf 'FAIL  %s -- %s\n' "$1" "$2"; }

section() { printf '\n== %s ==\n' "$1"; }

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

head_req() {
  local args=(-s -o /dev/null -I -D "$TMP/hdr" -w '%{http_code}')
  [ -n "${2:-}" ] && args+=(-H "Authorization: Bearer $2")
  STATUS="$(curl "${args[@]}" "$BASE_URL$1")"
  HDRS="$(cat "$TMP/hdr")"
  BODY=""
}

mint_jwt() {
  python - "${SMOKE_ENV_FILE:-$PROJECT_DIR/.env}" "$1" <<'PY'
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
key = secret.encode()
alg, digest = ('HS256', hashlib.sha256) if len(key) < 48 else ('HS384', hashlib.sha384) if len(key) < 64 else ('HS512', hashlib.sha512)
h = b64(json.dumps({"alg": alg, "typ": "JWT"}, separators=(',', ':')).encode())
p = b64(claims.encode())
s = b64(hmac.new(key, (h + '.' + p).encode(), digest).digest())
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

section "Infrastructure / docs"
req GET "/"
expect_status "GET / anonymous is 200 (public home page)" 200
expect_body_contains "GET / links to Swagger UI" "swagger-ui/index.html"

expect_body_contains "GET / loads the storefront script" '<script src="/app.js">'
expect_body_contains "GET / loads the storefront stylesheet" 'href="/app.css"'
case "$BODY" in
  *"[["*|*"[("*) bad "GET / has no Thymeleaf inlining sequences" "rendered page contains '[[' or '[('" ;;
  *) ok "GET / has no Thymeleaf inlining sequences" ;;
esac

head_req "/"
expect_status "HEAD / anonymous is 200" 200

req GET "/app.js"
expect_status "GET /app.js anonymous is 200 (storefront asset, permitAll GET only)" 200
expect_body_contains "GET /app.js is the storefront script" "Tyrone Grocery Shop"
req GET "/app.css"
expect_status "GET /app.css anonymous is 200 (storefront asset, permitAll GET only)" 200
req GET "/favicon.ico"
expect_status "GET /favicon.ico anonymous is 200 (storefront asset, permitAll GET only)" 200
expect_header_contains "GET /favicon.ico is served as an image" "content-type: image/"
req POST "/app.js"
expect_status "POST /app.js anonymous is 401 (only GET is permitted)" 401

req GET "/swagger-ui.html"
expect_status "GET /swagger-ui.html redirects (SwaggerSecurityRules permitAll)" 302

req GET "/swagger-ui/index.html"
expect_status "GET /swagger-ui/index.html is 200" 200

req GET "/v3/api-docs"
expect_status "GET /v3/api-docs is 200" 200
expect_body_contains "GET /v3/api-docs is an OpenAPI doc" '"openapi"'
expect_body_contains "/v3/api-docs declares the bearerAuth security scheme" '"bearerAuth"'
expect_eq "bearerAuth is an http/bearer scheme" \
  "$(pyq "$BODY" "d['components']['securitySchemes']['bearerAuth']['type'] + '/' + d['components']['securitySchemes']['bearerAuth']['scheme']")" "http/bearer"
expect_eq "bearerAuth is applied globally" \
  "$(pyq "$BODY" "any('bearerAuth' in s for s in d['security'])")" "True"
expect_eq "info.title is 'Tyrone Grocery Shop API'" "$(pyq "$BODY" "d['info']['title']")" "Tyrone Grocery Shop API"

section "Products - public reads"
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
expect_eq "GET /products returns fields in the order id, name, price, description, categoryId" \
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

head_req "/products"
expect_status "HEAD /products anonymous is 200" 200
head_req "/products/$P1_ID"
expect_status "HEAD /products/{id} anonymous is 200" 200

req GET "/products/abc"
expect_status "GET /products/abc (non-numeric id) is 400" 400
expect_body_contains "type-mismatch error body" "Invalid request parameter."

req GET "/products?categoryId=abc"
expect_status "GET /products?categoryId=abc is 400" 400
expect_body_contains "type-mismatch error body (query param)" "Invalid request parameter."

req GET "/products" "" "" "Accept: text/plain"
expect_status "GET /products with Accept: text/plain is 406" 406

section "Users - registration & validation"
EMAIL_A="alice.$TS@example.com"
EMAIL_B="bob.$TS@example.com"
EMAIL_ADMIN="admin.$TS@example.com"
PASS_A="secret123"
BOOT_PASS="$(python -c 'import secrets; print(secrets.token_hex(10))' 2>/dev/null)"
[ -n "$BOOT_PASS" ] || BOOT_PASS="b${TS:0:20}x"

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

UNIQUE_IDX="$(MYSQLQ "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='store_api' AND table_name='users' AND index_name='users_email_unique' AND non_unique=0;")"
expect_eq "users_email_unique UNIQUE index exists in the store-mysql container" "$UNIQUE_IDX" "1"

section "Auth - login / me / refresh"
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

req POST "/auth/refresh" "" "" "Cookie: refreshToken=$REFRESH_A"
expect_status "POST /auth/refresh with the cookie is 200" 200
expect_eq "POST /auth/refresh returns a new access token" \
  "$(pyq "$BODY" "d['token'].startswith('ey')")" "True"

req POST "/auth/refresh"
expect_status "POST /auth/refresh without the cookie is 401" 401

req GET "/auth/me" "" "$REFRESH_A"
expect_status "refresh token used as a Bearer access token is 401" 401

req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_A"
expect_status "access token used as the refreshToken cookie is 401" 401

req GET "/auth/me" "" "Bearer $TOKEN_A"
expect_status "'Authorization: Bearer Bearer <token>' is 401" 401

req GET "/products" "" "" "Authorization: Bearer "
expect_status "'Authorization: Bearer ' (empty token) on a public endpoint is 200" 200
req GET "/auth/me" "" "" "Authorization: Bearer "
expect_status "'Authorization: Bearer ' (empty token) on a protected endpoint is 401" 401

req GET "/nonexistent" "" "$TOKEN_A"
expect_status "GET /nonexistent with a valid token is 404" 404
expect_body_contains "404 carries Spring Boot's JSON error body" '"status":404'

req PATCH "/products/$P1_ID" '{"name":"x"}' "$TOKEN_A"
expect_status "PATCH /products/{id} is 405" 405
expect_body_contains "405 error body" "Method not allowed."

CT="text/plain"
req POST "/auth/login" "email=$EMAIL_A"
unset CT
expect_status "POST /auth/login with Content-Type: text/plain is 415" 415
expect_body_contains "415 error body" "Unsupported media type."

req GET "/" "" "$TOKEN_A"
expect_status "GET / authenticated renders the Thymeleaf page" 200
expect_body_contains "GET / renders the store name (h1)" "<h1>Tyrone Grocery Shop</h1>"

section "Admin - promotion & role-gated endpoints"
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
expect_body_contains "403 from the security layer has a JSON error body" '"error": "Access denied."'
expect_header_contains "403 body is application/json" "^content-type: *application/json"

req GET "/admin/hello" "" "$TOKEN_ADMIN"
expect_status "GET /admin/hello as ADMIN is 200" 200
expect_body_contains "GET /admin/hello greets the admin" "Hello Admin!"

section "Users - authenticated reads and writes"
req GET "/users"
expect_status "GET /users without a token is 401" 401

req GET "/users" "" "$TOKEN_A"
expect_status "GET /users as a normal USER is 403" 403
expect_body_contains "GET /users 403 body" "Access denied."

req GET "/users" "" "$TOKEN_ADMIN"
expect_status "GET /users as ADMIN is 200" 200
expect_eq "GET /users returns a non-empty list" "$(pyq "$BODY" "len(d) > 0")" "True"

req GET "/users?sort=email" "" "$TOKEN_ADMIN"
expect_status "GET /users?sort=email as ADMIN is 200" 200
expect_eq "GET /users?sort=email is sorted by e-mail" \
  "$(pyq "$BODY" "[u['email'] for u in d] == sorted(u['email'] for u in d)")" "True"

req GET "/users/$USER_A_ID" "" "$TOKEN_A"
expect_status "GET /users/{id} own account is 200" 200
expect_eq "GET /users/{id} returns the right user" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"

req GET "/users/$USER_B_ID" "" "$TOKEN_A"
expect_status "GET /users/{id} of another user as USER is 403" 403
expect_body_contains "ownership error message" "You don't have access to this user."

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "GET /users/{id} of another user as ADMIN is 200" 200
expect_eq "ADMIN sees the other user" "$(pyq "$BODY" "d['email']")" "$EMAIL_B"

req GET "/users/999999" "" "$TOKEN_A"
expect_status "GET /users/{id} unknown id as USER is 403" 403

req GET "/users/999999" "" "$TOKEN_ADMIN"
expect_status "GET /users/{id} unknown id as ADMIN is 404" 404

req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"$EMAIL_A\"}" "$TOKEN_A"
expect_status "PUT /users/{id} with both fields is 200" 200
expect_eq "PUT /users/{id} applied the new name" "$(pyq "$BODY" "d['name']")" "Alice Updated"

req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Partial\"}" "$TOKEN_A"
expect_status "PUT /users/{id} with only a name is 400" 400
expect_body_contains "missing e-mail message" "Email is required"

req PUT "/users/$USER_A_ID" "{\"email\":\"$EMAIL_A\"}" "$TOKEN_A"
expect_status "PUT /users/{id} with only an e-mail is 400" 400
expect_body_contains "missing name message" "Name is required"

req GET "/users/$USER_A_ID" "" "$TOKEN_A"
expect_eq "the rejected partial PUT changed nothing (name)" "$(pyq "$BODY" "d['name']")" "Alice Updated"
expect_eq "the rejected partial PUT changed nothing (e-mail)" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"

req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"UPPER.$TS@Example.COM\"}" "$TOKEN_A"
expect_status "PUT /users/{id} with an uppercase e-mail is 400" 400
expect_body_contains "uppercase e-mail message" "Email must be in lowercase"

req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"$EMAIL_B\"}" "$TOKEN_A"
expect_status "PUT /users/{id} to another user's e-mail is 400" 400
expect_body_contains "duplicate e-mail message on update" "Email is already registered."

req PUT "/users/$USER_B_ID" "{\"name\":\"Bob Hijacked\",\"email\":\"$EMAIL_B\"}" "$TOKEN_A"
expect_status "PUT /users/{id} of another user as USER is 403" 403
expect_body_contains "PUT ownership error message" "You don't have access to this user."

req PUT "/users/$USER_B_ID" "{\"name\":\"Bob Renamed\",\"email\":\"$EMAIL_B\"}" "$TOKEN_ADMIN"
expect_status "PUT /users/{id} of another user as ADMIN is 200" 200
expect_eq "ADMIN update applied" "$(pyq "$BODY" "d['name']")" "Bob Renamed"

NEW_PASS_A="newsecret123"
NEW_PASS_B="adminset123"

req POST "/users/$USER_A_ID/change-password" \
  "{\"oldPassword\":\"definitely-wrong\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "POST /users/{id}/change-password wrong old password is 401" 401

req POST "/users/$USER_A_ID/change-password" "{\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "change-password without oldPassword is 400" 400
expect_body_contains "missing oldPassword message" "Old password is required."

req POST "/users/$USER_A_ID/change-password" "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"abc\"}" "$TOKEN_A"
expect_status "change-password with a 3-char newPassword is 400" 400
expect_body_contains "short newPassword message" "Password must be between 6 to 25 characters long."

req POST "/users/$USER_A_ID/change-password" "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"\"}" "$TOKEN_A"
expect_status "change-password with a blank newPassword is 400" 400
expect_body_contains "blank newPassword is reported on the newPassword field" '"newPassword"'

req POST "/users/$USER_B_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "change-password on another user's account as USER is 403" 403
expect_body_contains "change-password ownership error message" "You don't have access to this user."

req POST "/users/$USER_A_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_A\"}" "$TOKEN_A"
expect_status "POST /users/{id}/change-password correct old password is 200" 200

PW_PREFIX="$(MYSQLQ "SELECT LEFT(password, 4) FROM users WHERE id = $USER_A_ID;")"
expect_eq "change-password stores a BCrypt hash (LEFT(password,4))" "$PW_PREFIX" '$2a$'

req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"$NEW_PASS_A\"}"
expect_status "login with the NEW password after change-password is 200" 200

req POST "/auth/login" "{\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}"
expect_status "login with the OLD password after change-password is 401" 401

req POST "/users/$USER_B_ID/change-password" \
  "{\"oldPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_PASS_B\"}" "$TOKEN_ADMIN"
expect_status "change-password on another user's account as ADMIN is 200" 200

req POST "/auth/login" "{\"email\":\"$EMAIL_B\",\"password\":\"$NEW_PASS_B\"}"
expect_status "the admin-set password works for the other user" 200
TOKEN_B="$(pyq "$BODY" "d['token']")"

section "Products - admin-only writes"
NEW_PRODUCT="{\"name\":\"Smoke Widget $TS\",\"price\":12.50,\"description\":\"smoke test product\",\"categoryId\":1}"

req POST "/products" "$NEW_PRODUCT"
expect_status "POST /products without a token is 401" 401

req POST "/products" "$NEW_PRODUCT" "$TOKEN_B"
expect_status "POST /products as a normal USER is 403" 403
expect_body_contains "POST /products 403 body" "Access denied."

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

req POST "/products" '{}' "$TOKEN_ADMIN"
expect_status "POST /products with an empty body is 400" 400
expect_eq "one message per missing field" "$(pyq "$BODY" "sorted(d.keys())")" "['categoryId', 'description', 'name', 'price']"
expect_body_contains "name message" "Name is required."
expect_body_contains "description message" "Description is required."
expect_body_contains "price message" "Price is required."
expect_body_contains "categoryId message" "Category ID is required."

req POST "/products" "{\"name\":\"Negative $TS\",\"price\":-1.00,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products with a negative price is 400" 400
expect_body_contains "negative price message" "Price must be greater than zero."

req POST "/products" "{\"name\":\"Zero $TS\",\"price\":0,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products with price 0 is 400" 400

req POST "/products" "{\"name\":\"Decimals $TS\",\"price\":9.999,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products with 3 decimals is 400" 400
expect_body_contains "decimals message" "Price must have at most 2 decimals."

req POST "/products" "{\"name\":\"Bad Category\",\"price\":1.00,\"description\":\"x\",\"categoryId\":99}" "$TOKEN_ADMIN"
expect_status "POST /products with an unknown categoryId is 400" 400

req PUT "/products/$NEW_PRODUCT_ID" \
  "{\"name\":\"\",\"price\":19.99,\"description\":\"updated\",\"categoryId\":2}" "$TOKEN_ADMIN"
expect_status "PUT /products/{id} with a blank name is 400" 400
expect_body_contains "PUT blank name message" "Name is required."

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

req POST "/products" "{\"name\":\"Ordered Widget $TS\",\"price\":5.00,\"description\":\"referenced by an order\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products creates the product to be ordered" 201
ORDERED_PRODUCT_ID="$(pyq "$BODY" "d['id']")"

ORDER_ID="$(MYSQLQ "INSERT INTO orders (customer_id, status, total_price) VALUES ($USER_A_ID, 'PENDING', 10.00); SELECT LAST_INSERT_ID();")"
MYSQLQ "INSERT INTO order_items (order_id, product_id, unit_price, quantity, total_price) VALUES ($ORDER_ID, $ORDERED_PRODUCT_ID, 5.00, 2, 10.00);" >/dev/null
if [ -n "$ORDER_ID" ]; then
  ok "seeded order $ORDER_ID for user A in the store-mysql container"
else
  bad "seeded order for user A" "no order id returned from MySQL"
fi

req DELETE "/products/$ORDERED_PRODUCT_ID" "" "$TOKEN_ADMIN"
expect_status "DELETE /products/{id} referenced by an order is 409" 409
expect_body_contains "409 error body" "Product is referenced by existing orders and cannot be deleted."

req GET "/products/$ORDERED_PRODUCT_ID"
expect_status "the ordered product still exists after the rejected delete" 200

section "Carts"
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

req POST "/carts/$CART_ID/items" '{}'
expect_status "POST /carts/{id}/items with an empty body is 400" 400
expect_body_contains "missing productId message" "Product ID is required."

req POST "/carts/$CART_ID/items" '{"productId":null}'
expect_status "POST /carts/{id}/items with productId null is 400" 400

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

req PUT "/carts/$CART_ID/items/$P1_ID" '{"quantity":1001}'
expect_status "PUT quantity=1001 is 400 (@Max(1000))" 400
expect_body_contains "@Max message says 1000" "Quantity must be less than or equal to 1000."

req PUT "/carts/$CART_ID/items/$P1_ID" '{}'
expect_status "PUT with no quantity is 400 (@NotNull)" 400
expect_body_contains "missing quantity message" "Quantity must be provided."

req PUT "/carts/$CART_ID/items/999999" '{"quantity":2}'
expect_status "PUT for a product not in the cart is 400" 400
expect_body_contains "product-not-in-cart message" "Product not found."

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

req GET "/carts/not-a-uuid"
expect_status "GET /carts/not-a-uuid is 400" 400
expect_body_contains "malformed UUID error body" "Invalid request parameter."

section "Checkout (without Stripe keys)"
req POST "/checkout" "{\"cartId\":\"$CART_ID\"}"
expect_status "POST /checkout without a token is 401" 401

req POST "/checkout" '{"cartId":"00000000-0000-0000-0000-000000000000"}' "$TOKEN_B"
expect_status "POST /checkout with an unknown cart is 400" 400
expect_body_contains "unknown cart message" "Cart not found"

req POST "/checkout" "{\"cartId\":\"$CART_ID\"}" "$TOKEN_B"
expect_status "POST /checkout with an empty cart is 400" 400
expect_body_contains "empty cart message" "Cart is empty"

req POST "/checkout" '{}' "$TOKEN_B"
expect_status "POST /checkout without a cartId is 400 (@NotNull)" 400
expect_body_contains "missing cartId message" "Cart ID is required."

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

section "Orders"
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

section "Stripe webhook"
STATUS_BEFORE="$(MYSQLQ "SELECT status FROM orders WHERE id = $ORDER_ID;")"

req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}' "" \
  "stripe-signature: t=1,v1=deadbeef"
expect_status "POST /checkout/webhook with a bogus signature is 500" 500
expect_body_contains "webhook failure message" "Error creating a checkout session"

req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}'
expect_status "POST /checkout/webhook without a stripe-signature header is 400" 400
expect_body_contains "missing signature error body" "Missing stripe-signature header."

req POST "/checkout/webhook" '{"id":"evt_test","type":"payment_intent.succeeded"}' "" "stripe-signature;"
expect_status "POST /checkout/webhook with a blank stripe-signature header is 400" 400

STATUS_AFTER="$(MYSQLQ "SELECT status FROM orders WHERE id = $ORDER_ID;")"
expect_eq "a rejected webhook did not change the order status" "$STATUS_AFTER" "$STATUS_BEFORE"

section "Users - delete"
req DELETE "/users/$USER_B_ID" "" "$TOKEN_A"
expect_status "DELETE /users/{id} of another user as USER is 403" 403
expect_body_contains "DELETE ownership error message" "You don't have access to this user."

req DELETE "/users/999999" "" "$TOKEN_A"
expect_status "DELETE /users/{id} unknown id as USER is 403" 403

req DELETE "/users/999999" "" "$TOKEN_ADMIN"
expect_status "DELETE /users/{id} unknown id as ADMIN is 404" 404

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "user B still exists before the self-delete" 200

req DELETE "/users/$USER_B_ID" "" "$TOKEN_B"
expect_status "DELETE /users/{id} own account is 200" 200

req GET "/users/$USER_B_ID" "" "$TOKEN_ADMIN"
expect_status "GET /users/{id} after delete as ADMIN is 404" 404

req GET "/users/$USER_B_ID" "" "$TOKEN_B"
expect_status "GET /users/{id} with the deleted user's own token is 403" 403
expect_body_contains "deleted-user error message" "You don't have access to this user."

section "Login"
EMAIL_LOGIN="login.$TS@example.com"
req POST "/users" "{\"name\":\"Login $TS\",\"email\":\"$EMAIL_LOGIN\",\"password\":\"$PASS_A\"}"
expect_status "registered a probe user" 201

req POST "/auth/login" "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"$PASS_A\"}"
expect_status "login with correct credentials" 200
expect_eq "login returns a JWT" "$(pyq "$BODY" "d['token'].startswith('ey')")" "True"

req POST "/auth/login" "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"wrong-password\"}"
expect_status "login with a wrong password" 401

req POST "/auth/login" "{\"email\":\"nobody.$TS@example.com\",\"password\":\"$PASS_A\"}"
expect_status "login with an unknown e-mail" 401

PW_HASH="$(MYSQLQ "SELECT password FROM users WHERE email='$EMAIL_LOGIN';")"
case "$PW_HASH" in
  '$2a$'*|'$2b$'*|'$2y$'*) ok "registration stores a BCrypt hash (${PW_HASH:0:4}...)" ;;
  *) bad "registration stores a BCrypt hash" "expected a bcrypt hash, got '${PW_HASH:0:20}'" ;;
esac

section "Tokens and error responses"
EMAIL_GONE="gone.$TS@example.com"
req POST "/users" "{\"name\":\"Gone $TS\",\"email\":\"$EMAIL_GONE\",\"password\":\"$PASS_A\"}"
expect_status "registered a user that will delete itself" 201
USER_GONE_ID="$(pyq "$BODY" "d['id']")"

req POST "/auth/login" "{\"email\":\"$EMAIL_GONE\",\"password\":\"$PASS_A\"}"
expect_status "logged in as that user" 200
TOKEN_GONE="$(pyq "$BODY" "d['token']")"
REFRESH_GONE="$(printf '%s' "$HDRS" | grep -i '^set-cookie: *refreshToken=' | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r')"

req DELETE "/users/$USER_GONE_ID" "" "$TOKEN_GONE"
expect_status "the user deleted its own account" 200

req POST "/auth/refresh" "" "" "Cookie: refreshToken=$REFRESH_GONE"
expect_status "POST /auth/refresh with the deleted user's refresh token is 401 (was 500)" 401
expect_body_empty "the 401 has no body (AuthController's BadCredentialsException handler)"

req GET "/admin/hello" "" "$TOKEN_A"
expect_status "GET /admin/hello as USER is 403" 403
expect_header_contains "403 Content-Type is application/json;charset=UTF-8 (was ISO-8859-1)" \
  "^content-type: *application/json; *charset=utf-8"

head_req "/users"
expect_status "HEAD /users anonymous is 401" 401
head_req "/users" "$TOKEN_A"
expect_status "HEAD /users as a normal USER is 403 (was 200)" 403
head_req "/users" "$TOKEN_ADMIN"
expect_status "HEAD /users as ADMIN is 200" 200

req GET "/carts/00000000-0000-0000-0000-000000000000" "" "" "Accept: text/html"
expect_status "GET /carts/{unknown} with Accept: text/html is 404 (was 500)" 404
expect_body_contains "... and carries the JSON error body" "Cart not found."
expect_header_contains "... as application/json" "^content-type: *application/json"

req POST "/carts/00000000-0000-0000-0000-000000000000/items" "{\"productId\":$P1_ID}" "" "Accept: application/xml"
expect_status "POST /carts/{unknown}/items with Accept: application/xml is 404 (was 500)" 404
expect_body_contains "... with the JSON error body" "Cart not found."

req POST "/carts/$CART_ID/items" '{"productId":999999}' "" "Accept: text/html"
expect_status "unknown product with Accept: text/html is 400 (was 500)" 400
expect_body_contains "... with the JSON error body" "Product not found."

req POST "/users" "{\"name\":\"Alice again\",\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}" "" "Accept: text/html"
expect_status "POST /users duplicate e-mail with Accept: text/html is 400 (was 500)" 400
expect_body_contains "... with the JSON error body" "Email is already registered."

req GET "/users/999999" "" "$TOKEN_A" "Accept: text/html"
expect_status "GET /users/{foreign} as USER with Accept: text/html is 403 (was 500)" 403
expect_body_contains "... with the JSON error body" "You don't have access to this user."

req GET "/orders/$ORDER_ID" "" "$TOKEN_ADMIN" "Accept: text/html"
expect_status "GET /orders/{id} of another user with Accept: text/html is 403 (was 500)" 403
expect_body_contains "... with the JSON error body" "You don't have access to this order."

req POST "/checkout" '{"cartId":"00000000-0000-0000-0000-000000000000"}' "$TOKEN_A" "Accept: text/html"
expect_status "POST /checkout unknown cart with Accept: text/html is 400 (was 500)" 400
expect_body_contains "... with the JSON error body" "Cart not found"

req GET "/products" "" "" "Accept: text/html"
expect_status "GET /products with Accept: text/html is 406" 406

req GET "/products/$P1_ID"
P1_NAME_BEFORE="$(pyq "$BODY" "d['name']")"
req POST "/products" "{\"id\":$P1_ID,\"name\":\"IdInjected $TS\",\"price\":1.00,\"description\":\"x\",\"categoryId\":1}" "$TOKEN_ADMIN"
expect_status "POST /products with an existing id in the body is 201" 201
INJECTED_ID="$(pyq "$BODY" "d['id']")"
if [ -n "$INJECTED_ID" ] && [ "$INJECTED_ID" != "$P1_ID" ] && [ "$INJECTED_ID" != "__PARSE_ERROR__" ]; then
  ok "the body id was ignored, a new product $INJECTED_ID was created (not $P1_ID)"
else
  bad "the body id was ignored" "response id is '$INJECTED_ID', request said $P1_ID"
fi
req GET "/products/$P1_ID"
expect_eq "product $P1_ID is untouched" "$(pyq "$BODY" "d['name']")" "$P1_NAME_BEFORE"
if [ -n "$INJECTED_ID" ] && [ "$INJECTED_ID" != "$P1_ID" ] && [ "$INJECTED_ID" != "__PARSE_ERROR__" ]; then
  req DELETE "/products/$INJECTED_ID" "" "$TOKEN_ADMIN"
  expect_status "cleanup of the created product" 204
fi

NOW="$(date +%s)"; EXP=$((NOW + 600))
TOKEN_TYPED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"type\":\"access\",\"iat\":$NOW,\"exp\":$EXP}")"
if [ -z "$TOKEN_TYPED" ]; then
  bad "minted test tokens" "no JWT_SECRET readable from $PROJECT_DIR/.env"
else
  req GET "/auth/me" "" "$TOKEN_TYPED"
  expect_status "control - a locally signed token typed 'access' is accepted" 200
  expect_eq "control - it resolves to user A" "$(pyq "$BODY" "d['id']")" "$USER_A_ID"

  TOKEN_UNTYPED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"iat\":$NOW,\"exp\":$EXP}")"
  req GET "/auth/me" "" "$TOKEN_UNTYPED"
  expect_status "a signed token WITHOUT a type claim is 401 (was 200)" 401

  TOKEN_MISCASED="$(mint_jwt "{\"sub\":\"$USER_A_ID\",\"role\":\"USER\",\"type\":\"Refresh\",\"iat\":$NOW,\"exp\":$EXP}")"
  req GET "/auth/me" "" "$TOKEN_MISCASED"
  expect_status "a signed token typed 'Refresh' is 401 (was 200)" 401

  req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_UNTYPED"
  expect_status "an untyped token as the refresh cookie is 401" 401
  req POST "/auth/refresh" "" "" "Cookie: refreshToken=$TOKEN_TYPED"
  expect_status "an access-typed token as the refresh cookie is 401" 401
fi

section "Forwarded headers"
req POST "/carts" "" "" "Forwarded: host=evil.example;proto=http"
expect_status "POST /carts with a client-supplied Forwarded header is 201" 201
case "$HDRS" in
  *evil.example*) bad "Location ignores a client-supplied Forwarded header" \
                      "built from it: $(printf '%s' "$HDRS" | grep -i '^location' | tr -d '\r')" ;;
  *) ok "Location ignores a client-supplied Forwarded header" ;;
esac

req POST "/carts" "" "" "X-Forwarded-Prefix: /evil"
case "$HDRS" in
  *"/evil/carts/"*) bad "Location ignores a client-supplied X-Forwarded-Prefix" \
                        "built from it: $(printf '%s' "$HDRS" | grep -i '^location' | tr -d '\r')" ;;
  *) ok "Location ignores a client-supplied X-Forwarded-Prefix" ;;
esac

req POST "/carts" "" "" "X-Forwarded-Port: 8443"
case "$HDRS" in
  *":8443/carts/"*) bad "Location ignores a client-supplied X-Forwarded-Port" \
                        "built from it: $(printf '%s' "$HDRS" | grep -i '^location' | tr -d '\r')" ;;
  *) ok "Location ignores a client-supplied X-Forwarded-Port" ;;
esac

req GET "/v3/api-docs" "" "" "Forwarded: host=evil.example;proto=http"
expect_status "GET /v3/api-docs with a client-supplied Forwarded header is 200" 200
case "$BODY" in
  *evil.example*) bad "OpenAPI servers[] ignores a client-supplied Forwarded header" \
                      "servers: $(pyq "$BODY" "d['servers']")" ;;
  *) ok "OpenAPI servers[] ignores a client-supplied Forwarded header ($(pyq "$BODY" "d['servers'][0]['url']"))" ;;
esac

section "Health, categories, checkout pages and admin bootstrap"
req GET "/actuator/health"
expect_status "GET /actuator/health anonymous is 200" 200
expect_eq "/actuator/health body is exactly {\"status\":\"UP\"} (show-details: never)" \
  "$(pyq "$BODY" "d == {'status': 'UP'}")" "True"
expect_header_contains "/actuator/health is served as JSON" "^content-type: *application/.*json"
head_req "/actuator/health"
expect_status "HEAD /actuator/health anonymous is 200 (read-only twin of GET)" 200
req GET "/actuator"
expect_status "GET /actuator anonymous is 401 (only the health path is public)" 401
req GET "/actuator/health/db"
expect_status "GET /actuator/health/db anonymous is 401 (no component details)" 401
req GET "/actuator/env"
expect_status "GET /actuator/env anonymous is 401" 401
req POST "/actuator/health"
expect_status "POST /actuator/health is 401 (GET only)" 401

req GET "/categories"
expect_status "GET /categories anonymous is 200" 200
expect_header_contains "/categories is application/json" "^content-type: *application/json"
expect_eq "GET /categories returns the 6 seeded categories" "$(pyq "$BODY" "len(d)")" "6"
expect_eq "GET /categories is ordered by id 1..6" "$(pyq "$BODY" "[c['id'] for c in d]")" "[1, 2, 3, 4, 5, 6]"
expect_eq "GET /categories carries the V5 names in order" \
  "$(pyq "$BODY" "[c['name'] for c in d]")" "['Produce', 'Dairy', 'Bakery', 'Meat & Seafood', 'Pantry Staples', 'Beverages']"
expect_eq "every entry is exactly {id: int, name: str}" \
  "$(pyq "$BODY" "all(set(c) == {'id', 'name'} and isinstance(c['id'], int) and isinstance(c['name'], str) for c in d)")" "True"
head_req "/categories"
expect_status "HEAD /categories anonymous is 200 (read-only twin of GET)" 200
req POST "/categories"
expect_status "POST /categories anonymous is 401 (GET and HEAD only)" 401

req GET "/checkout-success?orderId=1"
expect_status "GET /checkout-success?orderId=1 anonymous is 200" 200
expect_header_contains "/checkout-success is text/html" "^content-type: *text/html"
expect_body_contains "/checkout-success serves the storefront (h1)" "<h1>Tyrone Grocery Shop</h1>"
expect_body_contains "/checkout-success loads app.js" '<script src="/app.js">'
req GET "/checkout-success?orderId=abc"
expect_status "GET /checkout-success?orderId=abc is 200 (orderId is validated client-side)" 200
req GET "/checkout-success"
expect_status "GET /checkout-success without a query is 200" 200
req GET "/checkout-cancel"
expect_status "GET /checkout-cancel anonymous is 200" 200
expect_header_contains "/checkout-cancel is text/html" "^content-type: *text/html"
expect_body_contains "/checkout-cancel loads app.js" '<script src="/app.js">'
req POST "/checkout-success"
expect_status "POST /checkout-success is 401 (GET only)" 401
req POST "/checkout-cancel"
expect_status "POST /checkout-cancel is 401 (GET only)" 401
req GET "/"
expect_status "GET / is 200" 200

req GET "/v3/api-docs"
expect_status "GET /v3/api-docs is 200" 200
expect_eq "GET /categories is documented under the Products tag" \
  "$(pyq "$BODY" "d['paths']['/categories']['get']['tags']")" "['Products']"
expect_eq "GET /categories shows no lock (security: [])" \
  "$(pyq "$BODY" "d['paths']['/categories']['get']['security']")" "[]"
expect_eq "GET /categories summary" \
  "$(pyq "$BODY" "d['paths']['/categories']['get']['summary']")" "List categories (public)"
expect_eq "no actuator or checkout-return path in the OpenAPI document" \
  "$(pyq "$BODY" "[p for p in d['paths'] if 'actuator' in p or 'checkout-' in p]")" "[]"
expect_eq "CategoryDto.id is documented as an integer (not string/byte)" \
  "$(pyq "$BODY" "d['components']['schemas']['CategoryDto']['properties']['id']['type']")" "integer"

if [ -n "${SMOKE_ADMIN_EMAIL:-}" ]; then
  req PUT "/users/$USER_A_ID" "{\"name\":\"Alice Updated\",\"email\":\"$SMOKE_ADMIN_EMAIL\"}" "$TOKEN_A"
  expect_status "PUT /users/{id} to an ADMIN_EMAILS address as a USER is 403" 403
  expect_body_contains "... with the reason" "Only an admin can change an e-mail to one listed in ADMIN_EMAILS."
  req GET "/users/$USER_A_ID" "" "$TOKEN_A"
  expect_eq "the refused PUT changed nothing (e-mail)" "$(pyq "$BODY" "d['email']")" "$EMAIL_A"

  req POST "/users" "{\"name\":\"Bootstrap Admin $TS\",\"email\":\"$SMOKE_ADMIN_EMAIL\",\"password\":\"$BOOT_PASS\"}"
  if [ "$STATUS" = "400" ] && [ -n "$TOKEN_ADMIN" ]; then
    req GET "/users" "" "$TOKEN_ADMIN"
    LEFTOVER_ID="$(pyq "$BODY" "next((u['id'] for u in d if u['email'] == '$SMOKE_ADMIN_EMAIL'), '')")"
    req DELETE "/users/$LEFTOVER_ID" "" "$TOKEN_ADMIN"
    expect_status "removed the leftover $SMOKE_ADMIN_EMAIL account from a killed run" 200
    req POST "/users" "{\"name\":\"Bootstrap Admin $TS\",\"email\":\"$SMOKE_ADMIN_EMAIL\",\"password\":\"$BOOT_PASS\"}"
  fi
  expect_status "POST /users registers the ADMIN_EMAILS account ($SMOKE_ADMIN_EMAIL)" 201
  [ "$STATUS" = "201" ] && BOOT_ID="$(pyq "$BODY" "d['id']")"

  req POST "/auth/login" "{\"email\":\"$SMOKE_ADMIN_EMAIL\",\"password\":\"$BOOT_PASS\"}"
  expect_status "POST /auth/login as the ADMIN_EMAILS account is 200" 200
  BOOT_TOKEN="$(pyq "$BODY" "d['token']")"

  req GET "/admin/hello" "" "$BOOT_TOKEN"
  expect_status "GET /admin/hello as the ADMIN_EMAILS account is 200 (ADMIN at registration, no SQL)" 200
  expect_body_contains "... and greets the admin" "Hello Admin!"

  req GET "/users" "" "$BOOT_TOKEN"
  expect_status "GET /users as the ADMIN_EMAILS account is 200 (admin-only listing)" 200

  req DELETE "/users/$BOOT_ID" "" "$BOOT_TOKEN"
  expect_status "cleanup - the ADMIN_EMAILS account deleted itself (re-runnable)" 200
  [ "$STATUS" = "200" ] && BOOT_ID="" # done; nothing left for the EXIT trap
else
  printf 'SKIP  admin bootstrap - set SMOKE_ADMIN_EMAIL to a lowercase e-mail listed in the ADMIN_EMAILS of the instance under test\n'
fi

printf '\n=========================================\n'
printf 'PASSED: %d   FAILED: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFailed checks:\n'
  for n in "${FAILED_NAMES[@]}"; do printf '  - %s\n' "$n"; done
  exit 1
fi
printf 'All checks passed.\n'
exit 0
