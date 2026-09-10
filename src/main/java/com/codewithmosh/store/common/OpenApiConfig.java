package com.codewithmosh.store.common;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.context.annotation.Configuration;

// Fix beyond the course: declare the JWT bearer scheme so Swagger UI shows an Authorize button for protected endpoints.
// Beyond the course (API docs): API description (auth flow, roles, carts, Stripe) and ordered, described tags for Swagger UI.
@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "Tyrone Grocery Shop API",
        version = "1.0.0",
        description = """
            REST API behind **Tyrone Grocery Shop** ([open the shop](/)): a product catalogue, anonymous \
            shopping carts, Stripe checkout and the customer's order history. Responses are JSON; errors are \
            `{"error": "..."}` except validation failures, which map each invalid field to a message.

            **Quick start (2 minutes).**
            1. `POST /users` — register with a name, a lowercase e-mail and a 6–25 character password.
            2. `POST /auth/login` — send the same e-mail and password; copy the `token` from the response.
            3. Click **Authorize** (top right), paste the token, **Authorize**, **Close** — it is remembered \
            across page reloads.
            4. Try `GET /auth/me`, then `POST /carts` → `POST /carts/{cartId}/items` → `POST /checkout`.

            **Authentication.** The access token is a JWT valid for 15 minutes (a refresh token is also set \
            as an HttpOnly cookie for `POST /auth/refresh`); log in again when calls start returning 401. \
            Endpoints without a lock icon are public.

            **Roles.** New accounts have the role `USER`. `ADMIN` (managing products, listing users, \
            `/admin`) is granted directly in the database — \
            `UPDATE users SET role = 'ADMIN' WHERE email = '...'` — and takes effect at the next login.

            **Carts** are anonymous: `POST /carts` creates one and its UUID identifies it in every cart \
            call. Anyone who knows the UUID can read and change the cart.

            **Checkout** turns a cart into an order and a Stripe Checkout Session. It needs \
            `STRIPE_SECRET_KEY` to be configured; until then `POST /checkout` returns \
            `500 {"error": "Error creating a checkout session"}`.
            """
    ),
    security = @SecurityRequirement(name = "bearerAuth"),
    tags = {
        @Tag(name = "Products", description = "Product catalogue. Reading is public; creating, updating and deleting products requires the ADMIN role."),
        @Tag(name = "Carts", description = "Anonymous shopping carts identified by their UUID; no authentication."),
        @Tag(name = "Checkout", description = "Turns a cart into an order and a Stripe Checkout Session, and receives Stripe's webhook events."),
        @Tag(name = "Orders", description = "Order history of the authenticated user."),
        @Tag(name = "Users", description = "Registration (public) and account management (owner or admin); listing users is admin-only."),
        @Tag(name = "Auth", description = "Login, access-token refresh and the current user."),
        @Tag(name = "Admin", description = "Endpoints restricted to the ADMIN role.")
    }
)
@SecurityScheme(
    name = "bearerAuth",
    type = SecuritySchemeType.HTTP,
    scheme = "bearer",
    bearerFormat = "JWT"
)
public class OpenApiConfig {
}
