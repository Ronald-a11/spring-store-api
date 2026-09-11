# Tyrone Grocery Shop API

A REST API for a small online grocery store, built with Spring Boot while following Mosh Hamedani's
[Spring Boot: Mastering REST API Development](https://codewithmosh.com/p/spring-boot-building-apis) course.
It covers products, anonymous shopping carts, users with JWT authentication, Stripe checkout and order history.
On top of the course it adds stock tracking, product photos, order fulfillment statuses and an admin dashboard.
A storefront is served at `/` and the API is documented with Swagger UI.

Live demo: <https://store-api-production-de54.up.railway.app>
([Swagger UI](https://store-api-production-de54.up.railway.app/swagger-ui/index.html))

## Tech stack

- Java 25, Spring Boot 3.5 (Web, Security, Data JPA, Validation, Actuator)
- MySQL 8.4 with Flyway migrations
- JWT authentication (jjwt)
- Stripe Checkout
- MapStruct and Lombok
- springdoc-openapi for Swagger UI
- Thymeleaf pages styled with Tailwind CSS 4, with plain JavaScript modules

## Getting started

### Prerequisites

- JDK 25
- Maven 3.9+ (or the included Maven wrapper)
- Docker Desktop, running

### Configuration

Copy `.env.example` to `.env` and set `JWT_SECRET`. You can generate one with:

```bash
openssl rand -base64 32
```

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Key used to sign tokens, at least 32 bytes. The app won't start without it. |
| `STRIPE_SECRET_KEY` | No | Stripe secret key. Until it's set, `POST /checkout` returns an error. |
| `STRIPE_WEBHOOK_SECRET_KEY` | No | Signing secret for Stripe webhooks. |
| `ADMIN_EMAILS` | No | Comma-separated e-mails that get the `ADMIN` role. |
| `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | No | Admin account created at startup. See [Admin access](#admin-access). |
| `WEBSITE_URL` | No | Where Stripe redirects after checkout. Defaults to `http://localhost:8080`. |

### Run

```bash
mvn spring-boot:run
```

Spring Boot starts the MySQL container defined in `compose.yaml` (`store-mysql`, port 3307), Flyway creates the
schema and sample data, and the app starts on <http://localhost:8080>. The database keeps running after you stop
the app; stop it with `docker compose stop`.

Without Maven installed, use the wrapper: `./mvnw spring-boot:run`, or `mvnw.cmd spring-boot:run` on Windows.

- Storefront: <http://localhost:8080>
- Order history of the logged-in customer: <http://localhost:8080/my-orders>
- Admin dashboard (orders, goods and stock, adding products with photos): <http://localhost:8080/dashboard>
- Swagger UI: <http://localhost:8080/swagger-ui/index.html>
- Health check: <http://localhost:8080/actuator/health>

Everyone sees the same shop. Logged-in customers also get **My orders**, and admins get the **Dashboard**. The
pages themselves are public; the API behind them checks the token, so a customer who opens `/dashboard` gets
no data.

### Front end

The pages are Thymeleaf templates in `src/main/resources/templates`, with JavaScript modules in
`src/main/resources/static/js` and the Tailwind CSS source in `src/main/frontend/app.css`.

You don't need Node installed to run the app. During the build, `frontend-maven-plugin` downloads Node into
`target/`, installs the npm packages and runs `npm run build`, so `mvn spring-boot:run` and the Docker image
always have a fresh stylesheet. When you work on the styles, keep Tailwind running in watch mode next to the app
and reload the page to see changes:

```bash
npm install
npm run dev
```

### Tests

```bash
mvn verify
```

`scripts/smoke-test.sh` runs end-to-end checks against a running instance. It needs curl, Python and Docker.

```bash
BASE_URL=http://localhost:8080 bash scripts/smoke-test.sh
```

## API overview

| Endpoint | Access |
| --- | --- |
| `GET /products`, `GET /products/{id}`, `GET /categories`, `GET /images/{id}` | Public |
| `POST /products`, `PUT /products/{id}`, `DELETE /products/{id}` | Admin |
| `PUT /products/{id}/stock`, `PUT` and `DELETE /products/{id}/image` | Admin |
| `GET /admin/orders`, `PUT /admin/orders/{orderId}/fulfillment` | Admin |
| `POST /carts`, `GET /carts/{cartId}` | Public |
| `POST /carts/{cartId}/items`, `PUT` and `DELETE /carts/{cartId}/items/{productId}`, `DELETE /carts/{cartId}/items` | Public |
| `POST /users` | Public |
| `GET /users` | Admin |
| `GET`, `PUT` and `DELETE /users/{id}`, `POST /users/{id}/change-password` | Owner or admin |
| `POST /auth/login`, `POST /auth/refresh` | Public |
| `GET /auth/me`, `POST /checkout`, `GET /orders`, `GET /orders/{orderId}` | Logged in |
| `POST /checkout/webhook` | Called by Stripe |

Log in with `POST /auth/login` and send the returned token as `Authorization: Bearer <token>`. Access tokens
expire after 15 minutes; `POST /auth/refresh` issues a new one using the refresh token cookie.

## Stock and orders

Each product has a stock count. A cart can't hold more units than are in stock, and checkout takes the units out
of stock when it creates the order. They go back into stock when the payment fails or an admin cancels the order.
An order whose checkout was abandoned keeps its units until an admin cancels it from the dashboard.

Orders have two statuses: the payment status (`PENDING`, `PAID`, `FAILED`), set by the Stripe webhook, and the
fulfillment status (`PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELED`), set by an admin. Cancelling is final, and a
paid order still has to be refunded in the Stripe dashboard.

Product photos (JPEG, PNG or WebP, up to 2 MB) are stored in MySQL, so they survive redeploys.

## Stripe

Checkout uses Stripe in test mode. Put your test secret key in `STRIPE_SECRET_KEY`, then forward webhooks to the
local app with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to http://localhost:8080/checkout/webhook
```

Copy the signing secret it prints into `STRIPE_WEBHOOK_SECRET_KEY`. Pay with the test card `4242 4242 4242 4242`,
any future expiry date and any CVC. The order changes from `PENDING` to `PAID` when the webhook arrives.

## Admin access

The app creates an admin account at startup if it doesn't exist yet. With the `dev` profile you can log in with:

- E-mail: `admin@tyronegrocery.local`
- Password: `Admin@12345`

Set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` to use other details. The `prod` profile has no defaults,
so set both on the server (with a strong password) to get an admin there. The account is only created when it's
missing, so changing its password later sticks.

To make an existing account an admin, add its e-mail to `ADMIN_EMAILS` and restart the app. Listed accounts are promoted at
startup, and you need to log in again because the role is part of the token. Register before you add the e-mail:
there is no e-mail verification, so whoever registers a listed address first gets the role.

You can also promote a user in the database:

```bash
docker exec -it store-mysql mysql -uroot -p store_api
```

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

## Deploying to Railway

The `Dockerfile` builds the app, and the image runs with the `prod` profile.

1. Create a Railway project with a MySQL service and a service for the app.
2. Set these variables on the app service:

   | Variable | Value |
   | --- | --- |
   | `SPRING_DATASOURCE_URL` | `jdbc:mysql://${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}` |
   | `SPRING_DATASOURCE_USERNAME` | `${{MySQL.MYSQLUSER}}` |
   | `SPRING_DATASOURCE_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
   | `JWT_SECRET` | output of `openssl rand -base64 32` |
   | `WEBSITE_URL` | the service's public URL, without a trailing slash |
   | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | your admin login |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_KEY`, `ADMIN_EMAILS` | optional |

3. Deploy from the project folder:

   ```bash
   railway link
   railway up --service store-api
   ```

Railway doesn't apply `railway.json` to CLI uploads, so set the health check path (`/actuator/health`) and a
memory limit (1 GB is plenty) in the service settings.
