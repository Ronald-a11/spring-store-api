package com.codewithmosh.store.orders;

import com.codewithmosh.store.common.ErrorDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Admin")
@AllArgsConstructor
@RestController
@RequestMapping("/admin/orders")
public class AdminOrderController {
    private final OrderService orderService;

    @Operation(summary = "List all orders (admin only)",
               description = "Returns every customer's orders, newest first, with their items and customer. Requires the ADMIN role.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "All orders (an empty array if there are none)."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}")))
    })
    @GetMapping
    public List<AdminOrderDto> getAllOrders() {
        return orderService.getAllOrdersForAdmin();
    }

    @Operation(summary = "Update an order's fulfillment status (admin only)",
               description = "Moves an order between PROCESSING, SHIPPED and DELIVERED, or cancels it. Requires the ADMIN role. Canceling puts the items back in stock and can't be undone; a paid order still has to be refunded in the Stripe dashboard.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The updated order."),
        @ApiResponse(responseCode = "400", description = "The status is missing or unknown.",
                     content = @Content(schema = @Schema(type = "object"), examples = {
                         @ExampleObject(name = "Missing status", value = "{\"status\": \"Status is required.\"}"),
                         @ExampleObject(name = "Unknown status", value = "{\"error\": \"Invalid request body\"}")})),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No order with this ID (empty body).", content = @Content),
        @ApiResponse(responseCode = "409", description = "The order is already canceled.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"This order is canceled and can no longer change.\"}")))
    })
    @PutMapping("/{orderId}/fulfillment")
    public AdminOrderDto updateFulfillment(
        @Parameter(description = "Order ID.", example = "1") @PathVariable Long orderId,
        @Valid @RequestBody UpdateFulfillmentRequest request) {
        return orderService.updateFulfillmentStatus(orderId, request.getStatus());
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<Void> handleOrderNotFound() {
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(OrderCanceledException.class)
    public ResponseEntity<ErrorDto> handleOrderCanceled(Exception ex) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorDto(ex.getMessage()));
    }
}
