# Spring Boot: Mastering REST API Development

This repository contains the **completed code** for [Part 2 of my Spring Boot course](https://codewithmosh.com/p/spring-boot-building-apis).

In this project, we build the backend for an e-commerce application using Spring Boot. The API includes endpoints for:

- Managing products
- Managing shopping carts
- Checking out
- Viewing order history

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/mosh-hamedani/spring-api-finished.git
cd spring-api-finished
```

### 2. Configure Environment Variables
- Rename the ``.env.example`` file to ``.env``. 
- Update the following environment variables inside .env: 

#### JWT_SECRET

Generate a secure random key using:

```bash
openssl rand -base64 32
```

If ``openssl`` is not available, go to [generate-random.org](https://generate-random.org), click on **Strings > API Tokens**, and generate a secure token.

#### STRIPE_SECRET_KEY

- Create a free account at [stripe.com](https://stripe.com)
- On your dashboard, go to **Developers > API Keys**. You can use the search bar for quick access.
- Copy the value of the **Secret Key**.

#### STRIPE_WEBHOOK_SECRET_KEY

- Install the Stripe CLI: https://docs.stripe.com/stripe-cli
- Login and start the webhook listener:

```bash
stripe login
stripe listen --forward-to http://localhost:8080/checkout/webhook
```
- Copy the **signing secret** from the terminal output and use it as the value for ``STRIPE_WEBHOOK_SECRET_KEY``.

---

## ▶️ Running the Project

This is a Maven project. To start the application, run:

```bash
./mvnw spring-boot:run
```

If you're on Windows:

```bash
mvnw.cmd spring-boot:run
```

Once running, the application will be available at:

```arduino
http://localhost:8080
```

---

## 📚 API Documentation

Swagger UI is available at:

```bash
http://localhost:8080/swagger-ui.html
```

---

## 🧪 Example API Flow

Here's a sample flow to help you understand how to interact with the API after starting the application.

### 1. Get All Products 

```bash
GET /products
```

The database is automatically populated with 10 sample products using a Flyway migration script.

### 2. Create a Shopping Cart 

```bash
POST /carts
```

This will return the cart ID. You don't need to be logged in to create a cart.

### 3. Add Items to Cart 

Once you have a cart ID, you can add products to it by sending:

```bash
POST /carts/{cartId}/items
```

**Request body example**:
```json
{
  "productId": 1
}
```

### 4. Register a New User 
To check out, you have to register and login first: 

```bash
POST /users
```

**Request body**:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "123456"
}
```

### 5. Login to Get an Access Token 

```bash
POST /auth/login 
```

**Request body**:
```json
{
  "email": "john@example.com",
  "password": "123456"
}
```

**Response body**:
```json
{
  "token": "your-json-web-token"
}
```

### 6. Checkout 

```bash
POST /checkout 
```

**Headers**
```bash
Authorization: Bearer your-json-web-token
```

**Request body**
```json
{
  "cartId": "your-cart-id"
}
```

This endpoint returns a Stripe checkout URL. Open it in your browser to complete the payment using a test card:

```yaml
Card: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
```

### 7. Webhook & Order Status Update

Once payment is completed, Stripe will trigger a webhook call to:

```bash
POST /checkout/webhook 
```

Our backend listens for this event and updates the order status in the database accordingly.

---

## 🧠 Learn More
Want to learn how this project was built step by step?

Check out the full course here: [Spring Boot: Mastering REST API Development](https://codewithmosh.com/p/spring-boot-building-apis)

---

## Running on this machine

This clone differs from the course code in a few places. Everything below is local setup only — the API itself is unchanged.

### Toolchain

Built with **Java 25** (JDK 25.0.4) and **Spring Boot 3.5.16** instead of the course's Java 17 and Boot 3.4.1. Dependencies bumped to versions that work on Java 25:

| Dependency | Course | Here |
| --- | --- | --- |
| Spring Boot parent | 3.4.1 | 3.5.16 |
| Java | 17 | 25 |
| Lombok | Boot-managed | 1.18.48 (+ `lombok-mapstruct-binding` 0.2.0) |
| MapStruct | 1.6.2 / 1.6.3 | 1.6.3 |
| jjwt-jackson | 0.12.5 | 0.12.6 |
| springdoc-openapi | 2.8.6 | 2.8.17 |
| stripe-java | 29.0.0 | 33.4.2 |

Flyway and Spring Security come from the Boot parent.

### Database

The course connects to a local MySQL on port **3306** as `root` / `MyPassword!`. The MySQL Windows service on this machine has a different root password, so the dev database runs in Docker instead:

```bash
docker start store-mysql
```

That container is MySQL 8.4.11, published on host port **3307**, database `store_api`.

`application-dev.yaml` reads the connection from `DB_URL`, `DB_USERNAME` and `DB_PASSWORD`. `.env.example` already carries the Docker container's values, so renaming it to `.env` (step 2 above) gives you a working database connection — `JWT_SECRET` must still be filled in (see [Stripe keys are optional](#stripe-keys-are-optional) below):

```
DB_URL=jdbc:mysql://localhost:3307/store_api?createDatabaseIfNotExist=true
DB_USERNAME=root
DB_PASSWORD=MyPassword!
```

If those variables are unset, `application-dev.yaml` falls back to the same 3307 container
rather than the course's 3306, so no code path on this machine can reach the MySQL Windows
service.

Flyway applies `V1`–`V6` on startup.

### Stripe keys are optional

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET_KEY` default to empty, so the app starts without a Stripe account. Until `STRIPE_SECRET_KEY` is set in `.env`, `POST /checkout` returns the course's payment error. `JWT_SECRET` is still required — generate one with `openssl rand -base64 32`.

### Run it

```bash
mvn spring-boot:run
```

or, using the wrapper on Windows:

```bash
mvnw.cmd spring-boot:run
```

Swagger UI: <http://localhost:8080/swagger-ui.html>

`mvn clean verify` (or `mvn clean package`) also needs the container running: the only
test is a `@SpringBootTest` context load, which opens a real connection and runs Flyway.
Start it first with `docker start store-mysql`, or the build fails on the datasource.
The test supplies its own throw-away `spring.jwt.secret`, so it needs neither `.env` nor a
`JWT_SECRET` in the environment (the startup check would otherwise fail the context load).

The `flyway-maven-plugin` block in `pom.xml` is pointed at port **3307** as well, so an
explicit `mvn flyway:info` / `flyway:migrate` targets the Docker container and never the
MySQL Windows service on 3306. Boot runs Flyway at startup, so those goals are not
normally needed. The course's `<version>10.15.0</version>` pin was dropped: Boot 3.5.16
puts flyway-core 11.7.2 on the plugin's class realm, and a Flyway 10 plugin loaded next to
a Flyway 11 core fails with `IncompatibleClassChangeError` before it reaches a database.
Without the pin the plugin resolves to the Boot-managed 11.7.x and matches the runtime.

Note that the course's `<cleanDisabled>false</cleanDisabled>` is kept, so `mvn flyway:clean`
really will drop every object in `store_api` on the container. Only the container — never
3306 — but it is destructive; don't run it unless that is what you want.

### Making an admin

Register a user through `POST /users`, then promote it in the Docker database:

```bash
docker exec -it store-mysql mysql -uroot -p store_api
```

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

Log in again afterwards — the role is baked into the access token.

## Using the storefront

The home page (<http://localhost:8080/>) is a small storefront built from
`templates/index.html`, `static/app.css` and `static/app.js` — vanilla HTML, CSS and ES2020,
no framework, no build step. It only calls the JSON API on the same origin, so everything it
does can also be done from Swagger UI or curl:

1. **Browse.** `GET /products` fills the grid; the search box filters by name and the
   category buttons (one per category present in the catalogue, named after the `V5` seed)
   filter by `categoryId`.
2. **Cart.** The first *Add to cart* creates an anonymous cart (`POST /carts`) and keeps its
   UUID in `localStorage`; the +/−, *Remove* and *Clear* controls map to the
   `/carts/{cartId}/items` endpoints. A stale UUID (unknown cart, `404`) is dropped and a new
   cart is created on the next add.
3. **Register / log in.** The dialog posts to `POST /users` and `POST /auth/login`; the access
   token is kept in `localStorage` and its payload is decoded only to show your name and role.
   Tokens last 15 minutes: any `401` on an authenticated call ends the session with
   *Session expired, please log in again*.
4. **Checkout.** *Checkout* is enabled once you are logged in and the cart is not empty; it
   posts `{cartId}` to `POST /checkout` and opens the returned Stripe URL. Without a
   `STRIPE_SECRET_KEY` the API answers `500`, which the page shows as *Payments are not
   configured on this demo (no Stripe key) — the order was not created.*
5. **My orders.** Visible when logged in; lists `GET /orders` with status, date, total and items.
6. **Admin.** When the token's role is `ADMIN` the page shows an *add product* form
   (`POST /products`) and a *Delete* button on every product card (`DELETE /products/{id}`;
   a product that belongs to an order answers `409`). To become an admin, promote your
   account with the SQL `UPDATE` in [Making an admin](#making-an-admin) and log in again.

If the first request takes more than two seconds (a sleeping demo host), the page shows
*Waking up the server…* until `GET /products` answers. The footer still links to Swagger UI
and the raw `/products` JSON.

---

## Fixes beyond the course

This port is byte-identical to Mosh's finished code except for the stack bumps listed
under [Toolchain](#toolchain) and the fixes below. Every deviation is marked in the source
with a one-line comment starting with `// Fix beyond the course:` (or
`-- Fix beyond the course:` in SQL), so `grep -r "Fix beyond the course"` lists them all.

| Area | Change | Why |
| --- | --- | --- |
| Users | `POST /users/{id}/change-password` now hashes the new password with the same `PasswordEncoder` used at registration | The course stored the new password in plaintext; the account was locked out because login compares against a BCrypt hash |
| Users | `UNIQUE` index on `users.email` (migration `V6`), duplicate check on `PUT /users/{id}`, and registration and update catch the constraint violation | Two registrations racing on the same email both succeeded and the second could not log in; an update could take over another user's email |
| Users | `/users/{id}` endpoints are owner-or-admin, `GET`/`HEAD /users` are admin-only; a foreign id returns `403 {"error": "You don't have access to this user."}` | Any authenticated user could read, edit and delete any other user; Spring MVC serves `HEAD` through the `GET` handler, so a `GET`-only rule let a normal user run the list query with `HEAD` |
| Users | `UpdateUserRequest` is validated and partial updates keep the existing fields | A body with only `name` blanked out the email (and vice-versa); malformed values were written as-is |
| Auth | Access tokens carry `type=access` and refresh tokens `type=refresh`; the filter only authenticates a token typed `access` and `/auth/refresh` only accepts a token typed `refresh`. Tokens minted by a build without the claim are rejected — log in again once | A 7-day refresh token could be sent as a Bearer header and used as a 7-day access token; a negative "not a refresh token" check would still have accepted an untyped token from an older build |
| Auth | `POST /auth/refresh` with a refresh token whose user no longer exists returns `401` | The course's `orElseThrow()` threw `NoSuchElementException` for a deleted user; with error dispatch permitted that became `500 {"error": "Unexpected error."}` plus a stack trace for a normal client condition |
| Auth | Error dispatch (`/error`) is permitted, so real errors return `400`/`405`/`406`/`409`/`415`/`500` with an `{"error": ...}` body | Every server-side failure surfaced as a blank `401` because the security filter intercepted the forward to `/error` |
| Common | The feature-level error handlers (`{"error": ...}` bodies in the cart, user, order and checkout controllers) and the global `409` preset `Content-Type: application/json` | With an `Accept` header that excludes JSON (`text/html`, `application/xml`) the handler's body could not be written, the original exception fell through to `/error` and the client got a `500` Whitelabel page instead of the intended `400`/`403`/`404`/`409` |
| Auth | `403` responses carry a JSON `{"error": ...}` body, served as `application/json;charset=UTF-8` | Forbidden requests returned an empty body, unlike every other error in the API; without an explicit character encoding Tomcat labelled the body `charset=ISO-8859-1` |
| Auth | `Authorization: Bearer` header is parsed with `substring` instead of `replace` | `replace` stripped every occurrence of `Bearer ` and accepted `Bearer Bearer <token>` |
| Auth | `HEAD /products` is permitted alongside `GET` | Health checks and proxies that send `HEAD` got `401` for a public endpoint |
| Auth | Swagger UI has an **Authorize** button (`bearerAuth` security scheme) | Protected endpoints could not be tried from `/swagger-ui.html` without a browser extension |
| Products | `POST /products` and `PUT /products/{id}` are validated; deleting a product that belongs to an order returns `409` | Empty names and negative prices were stored; deleting an ordered product hit the foreign key and came back as a blank `401` |
| Products | `POST /products` ignores an `id` in the request body | MapStruct copied the id into the new entity and `save()` merged it into the existing row, so an admin could overwrite a catalogue product and still get `201 Created` |
| Carts | `POST /carts/{cartId}/items` validates `productId` | A missing or null `productId` reached the repository and became a `500` (surfacing as a blank `401`) |
| Carts | `@Max` message typo fixed on `UpdateCartItemRequest.quantity` | The validation message did not match the rule it enforced |
| Payments | Webhook: missing `Stripe-Signature` header returns `400`; malformed `order_id` metadata and unknown orders are handled without crashing; only `PENDING` orders transition | A request without the header threw and became a blank `401`; a bad metadata value crashed the handler; an order already `PAID` or `FAILED` took whatever status a late or replayed event carried |
| Payments | `WARN` logged at startup when `STRIPE_SECRET_KEY` is blank | The app started silently with Stripe unconfigured and only failed at the first checkout |
| Users | `@Builder.Default` on `User.favoriteProducts` | Lombok's builder ignored the field initialiser, so `User.builder().build()` had a `null` set and `addFavoriteProduct` threw `NullPointerException` |
| Common | `GET /` is public and the home page links to Swagger UI and `/products` | No security rule permitted `/`, so opening the root URL in a browser returned a blank `401` and looked like the app was down |
| Auth | The app refuses to start when `JWT_SECRET` is blank or shorter than 32 bytes (256 bits); the value is never logged | A blank secret booted a "healthy" app in which every `POST /auth/login` returned `401` (`WeakKeyException` at the first login), so a deployment health check could not tell |
| Docs | Swagger UI documents every endpoint: tags, summaries, status codes, examples; Authorize persists across reloads; public endpoints show no lock | The course strips its OpenAPI annotations at the end, so the generated docs listed bare paths with no explanation, and with the global `bearerAuth` requirement every operation showed a lock — public ones included |
| Web UI | The home page is a small storefront (vanilla HTML/JS) that uses the public and authenticated endpoints; Swagger UI stays at `/swagger-ui/index.html`. `GET /app.js`, `/app.css` and `/favicon.ico` are permitted (GET only) so the assets load anonymously | The root URL only said "the API is running"; the storefront exercises the whole flow — browse, cart, register, log in, check out, order history, admin product management — from a browser without Swagger or curl (see [Using the storefront](#using-the-storefront)) |

### Still as in the course (known limitations)

These are unchanged because the course does not address them and fixing them would change the API's shape:

- **Carts are anonymous.** The cart UUID is the only credential; anyone who knows it can read and change the cart.
- **Access tokens outlive the user.** A deleted or demoted user's access token stays valid until it expires (15 minutes) — the JWT is stateless and nothing checks the database on each request. (The refresh token of a deleted user is rejected with `401`, see the table above, so no new access token can be minted for it.)
- **Concurrent adds to one cart can collide.** Two simultaneous `POST /carts/{cartId}/items` for the same product may both try to insert the same row; the loser now gets a `409` instead of a blank `401`, but there is no retry.
- **Webhook has no idempotency or amount check.** A replayed `payment_intent.succeeded` event is processed again, and the paid amount is never compared with the order total.
- **`refreshToken` cookie has no `SameSite` attribute.** The course sets `HttpOnly`, `Secure` and `Path=/auth/refresh` only.
- **`mvn flyway:clean` is enabled** (`cleanDisabled=false`, the course default) and drops every object in the Docker dev database `store_api`.
- **Stripe API version.** stripe-java 33.4.2 pins Stripe API version `2026-08-26.dahlia`. If the Stripe account or webhook endpoint is on another version, the webhook payload deserialises to nothing and orders stay `PENDING` — the Stripe CLI (`stripe listen`) uses the account's default version, so check it under **Developers > API version**.

---

## Deploying to Railway

The repo ships a multi-stage `Dockerfile` (JDK 25 + Maven wrapper build stage, JRE 25
runtime, non-root user, both base images pinned by digest so a rebuild cannot silently
change the JDK, and the build stage pins the SHA-256 of the Maven distribution the
wrapper downloads, so a tampered download fails the build) and a `railway.json` that
makes Railway build from it, health-check `GET /` and restart on failure. Create a
Railway project from this GitHub repo (Railway builds `main`, so the `Dockerfile`,
`railway.json` and `.railwayignore` must be committed there) — or deploy from the CLI:
run `railway init` or `railway link` **in this directory first** and pass
`--service store-api` to every `railway up`, `railway variable set` and `railway domain`,
because the CLI otherwise falls back to the nearest linked parent folder, which may belong
to another project; `.railwayignore` keeps `.env`, `target/` and `.git/` out of the upload —
add a **MySQL** service next to it, and set these variables on the API service:

| Variable | Value |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` — already the image default (`ENV` in the `Dockerfile`), so setting it on the service is optional but harmless |
| `SPRING_DATASOURCE_URL` | `jdbc:mysql://<host>:<port>/<database>` built from the MySQL service's `MYSQLHOST`, `MYSQLPORT` and `MYSQLDATABASE` (reference them as `${{MySQL.MYSQLHOST}}` etc.) |
| `SPRING_DATASOURCE_USERNAME` | the MySQL service's `MYSQLUSER` |
| `SPRING_DATASOURCE_PASSWORD` | the MySQL service's `MYSQLPASSWORD` |
| `JWT_SECRET` | `openssl rand -base64 32` (or `openssl rand -hex 64`; any value of at least 32 bytes) — required; the app refuses to start when it is blank or too short, so a forgotten value fails the health check instead of producing a deployment that cannot log anyone in |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_KEY` | optional; leave unset until Stripe is wired up (checkout returns the payment error, startup logs a `WARN`) |
| `JAVA_OPTS` | optional; the image defaults to `-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError` — the heap is capped at 50% of the service's memory limit (512 MiB at 1 GB; the live heap is ~40 MiB) and an `OutOfMemoryError` exits the JVM so the `ON_FAILURE` restart policy replaces it. 50% rather than 75% because the JVM's non-heap footprint is ~290 MiB: a 768 MiB heap could grow past a 1 GiB limit and be OOM-killed by the kernel (exit 137) before an `OutOfMemoryError` is thrown |

Do not set `PORT`: Railway injects it and the container's entrypoint passes it to Spring as
`--server.port=${PORT:-8080}` (Spring Boot does not read `PORT` by itself). Flyway applies
`V1`–`V6` to the Railway database on the first start, and the health check is `GET /`, which
is public and serves the home page. `websiteUrl` in `application-prod.yaml` is still the
course's `https://mystore.com` placeholder for the Stripe redirect.

Set an explicit **memory limit** on the API service (service **Settings → Resource
limits**; 1 GB is plenty): the JVM sizes its heap from the container's cgroup limit, and
without a per-service limit that is the plan maximum, so RAM — which Railway bills per
GB — is otherwise unbounded. The entrypoint `exec`s `java`, so it runs as PID 1 and receives
the `SIGTERM` Railway sends on stop and redeploy; Spring Boot's graceful shutdown (the
default since 3.4) then finishes in-flight requests before the container exits instead of
the JVM being killed after the grace period.

Swagger UI (`/swagger-ui/index.html`) and the OpenAPI document (`/v3/api-docs`) stay public
in prod on purpose — this is a portfolio API. To hide them, add
`springdoc.api-docs.enabled: false` and `springdoc.swagger-ui.enabled: false` to
`application-prod.yaml`.

A clean prod start logs no `ERROR` lines and exactly these `WARN` lines, all harmless:
Flyway "MySQL 8.4 is newer than this version of Flyway", `StripeConfig` "STRIPE_SECRET_KEY
is not set" (until Stripe is configured), "Global AuthenticationManager configured with an
AuthenticationProvider bean", "spring.jpa.open-in-view is enabled by default", and the two
SpringDoc notices that `/v3/api-docs` and `/swagger-ui.html` are enabled in production.

Live: https://store-api-production-de54.up.railway.app — Swagger UI at
https://store-api-production-de54.up.railway.app/swagger-ui/index.html
