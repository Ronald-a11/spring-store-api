package com.codewithmosh.store.common;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "Tyrone Grocery Shop API",
        version = "1.0.0",
        description = """
            REST API for Tyrone Grocery Shop ([open the shop](/)): products, carts, Stripe checkout and orders. \
            Errors come back as `{"error": "..."}`; validation errors map each invalid field to a message.

            To call a protected endpoint, register with `POST /users`, log in with `POST /auth/login`, then click \
            **Authorize** and paste the token. Access tokens expire after 15 minutes.

            Carts are anonymous and identified by their UUID. Managing products, stock and photos, listing users and \
            managing all orders requires the `ADMIN` role. Checkout needs `STRIPE_SECRET_KEY`; without it \
            `POST /checkout` returns a 500.
            """
    ),
    security = @SecurityRequirement(name = "bearerAuth"),
    tags = {
        @Tag(name = "Products", description = "Product catalogue, categories and product photos. Reading is public; changing products, their stock and photos requires the ADMIN role."),
        @Tag(name = "Carts", description = "Anonymous shopping carts identified by their UUID; no authentication."),
        @Tag(name = "Checkout", description = "Turns a cart into an order and a Stripe Checkout Session, and receives Stripe's webhook events."),
        @Tag(name = "Orders", description = "Order history of the authenticated user."),
        @Tag(name = "Users", description = "Registration (public) and account management (owner or admin); listing users is admin-only."),
        @Tag(name = "Auth", description = "Login, access-token refresh and the current user."),
        @Tag(name = "Admin", description = "Endpoints restricted to the ADMIN role: every customer's orders and their fulfillment status.")
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
