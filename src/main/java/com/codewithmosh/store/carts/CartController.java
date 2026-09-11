package com.codewithmosh.store.carts;

import com.codewithmosh.store.common.ErrorDto;
import com.codewithmosh.store.products.ProductNotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.UUID;

@Tag(name = "Carts")
@AllArgsConstructor
@RestController
@RequestMapping("/carts")
public class CartController {
    private final CartService cartService;

    @Operation(summary = "Create a cart (public)",
               description = "Creates an empty anonymous cart. Keep the returned UUID: it is the only handle on the cart. The `Location` header points at `/carts/{cartId}`.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "The new, empty cart; `Location` header set.",
                     headers = @Header(name = "Location", description = "URL of the new cart.", schema = @Schema(type = "string")))
    })
    @PostMapping
    public ResponseEntity<CartDto> createCart(
        UriComponentsBuilder uriBuilder
    ) {
        var cartDto = cartService.createCart();
        var uri = uriBuilder.path("/carts/{id}").buildAndExpand(cartDto.getId()).toUri();

        return ResponseEntity.created(uri).body(cartDto);
    }

    @Operation(summary = "Add a product to a cart (public)",
               description = "Adds one unit of the product; if the product is already in the cart its quantity is incremented by one instead. Returns the affected cart item.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "The cart item after the add."),
        @ApiResponse(responseCode = "400", description = "The product does not exist, or validation failed (a field-to-message map).",
                     content = @Content(schema = @Schema(type = "object"), examples = {
                         @ExampleObject(name = "Unknown product", value = "{\"error\": \"Product not found.\"}"),
                         @ExampleObject(name = "Missing productId", value = "{\"productId\": \"Product ID is required.\"}")})),
        @ApiResponse(responseCode = "404", description = "No cart with this UUID.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Cart not found.\"}")))
    })
    @PostMapping("/{cartId}/items")
    public ResponseEntity<CartItemDto> addToCart(
        @Parameter(description = "Cart UUID returned by POST /carts.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7") @PathVariable UUID cartId,
        @Valid @RequestBody AddItemToCartRequest request) {
        var cartItemDto = cartService.addToCart(cartId, request.getProductId());

        return ResponseEntity.status(HttpStatus.CREATED).body(cartItemDto);
    }

    @Operation(summary = "Get a cart (public)",
               description = "Returns the cart with its items and total.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The cart."),
        @ApiResponse(responseCode = "404", description = "No cart with this UUID.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Cart not found.\"}")))
    })
    @GetMapping("/{cartId}")
    public CartDto getCart(@Parameter(description = "Cart UUID returned by POST /carts.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7") @PathVariable UUID cartId) {
        return cartService.getCart(cartId);
    }

    @Operation(summary = "Set the quantity of a cart item (public)",
               description = "Sets the quantity (1 to 1000) of a product that is already in the cart.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The updated cart item."),
        @ApiResponse(responseCode = "400", description = "The product is not in the cart, or validation failed (a field-to-message map).",
                     content = @Content(schema = @Schema(type = "object"), examples = {
                         @ExampleObject(name = "Product not in cart", value = "{\"error\": \"Product not found.\"}"),
                         @ExampleObject(name = "Bad quantity", value = "{\"quantity\": \"Quantity must be less than or equal to 1000.\"}")})),
        @ApiResponse(responseCode = "404", description = "No cart with this UUID.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Cart not found.\"}")))
    })
    @PutMapping("/{cartId}/items/{productId}")
    public CartItemDto updateItem(
        @Parameter(description = "Cart UUID returned by POST /carts.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7") @PathVariable("cartId") UUID cartId,
        @Parameter(description = "ID of a product that is in the cart.", example = "1") @PathVariable("productId") Long productId,
        @Valid @RequestBody UpdateCartItemRequest request
    ) {
       return cartService.updateItem(cartId, productId, request.getQuantity());
    }

    @Operation(summary = "Remove a product from a cart (public)",
               description = "Removes the product's line from the cart. A product that is not in the cart is ignored and still answers 204.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Removed, or was not in the cart.", content = @Content),
        @ApiResponse(responseCode = "404", description = "No cart with this UUID.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Cart not found.\"}")))
    })
    @DeleteMapping("/{cartId}/items/{productId}")
    public ResponseEntity<?> removeItem(
        @Parameter(description = "Cart UUID returned by POST /carts.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7") @PathVariable("cartId") UUID cartId,
        @Parameter(description = "Product ID.", example = "1") @PathVariable("productId") Long productId
    ) {
        cartService.removeItem(cartId, productId);

        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Empty a cart (public)",
               description = "Removes every item from the cart; the cart itself stays.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Cart emptied."),
        @ApiResponse(responseCode = "404", description = "No cart with this UUID.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Cart not found.\"}")))
    })
    @DeleteMapping("/{cartId}/items")
    public ResponseEntity<Void> clearCart(@Parameter(description = "Cart UUID returned by POST /carts.", example = "7c9e6679-7425-40de-944b-e07fc1f90ae7") @PathVariable UUID cartId) {
        cartService.clearCart(cartId);

        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(CartNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleCartNotFound() {
        // Set the content type explicitly so the body is written even when Accept excludes JSON.
        return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", "Cart not found."));
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleProductNotFound() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", "Product not found."));
    }
}
