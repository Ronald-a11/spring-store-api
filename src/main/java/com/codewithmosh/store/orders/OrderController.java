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
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Orders")
@AllArgsConstructor
@RestController
@RequestMapping("/orders")
public class OrderController {
    private final OrderService orderService;

    @Operation(summary = "List my orders",
               description = "Returns the orders placed by the authenticated user, with their items.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The caller's orders (an empty array if there are none)."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content)
    })
    @GetMapping
    public List<OrderDto> getAllOrders() {
        return orderService.getAllOrders();
    }

    @Operation(summary = "Get one of my orders",
               description = "Returns an order with its items. Only the user who placed it may read it; an admin is no exception.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The order."),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The order belongs to another user.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"You don't have access to this order.\"}"))),
        @ApiResponse(responseCode = "404", description = "No order with this ID (empty body).", content = @Content)
    })
    @GetMapping("/{orderId}")
    public OrderDto getOrder(@Parameter(description = "Order ID, from POST /checkout or GET /orders.", example = "1") @PathVariable("orderId") Long orderId) {
        return orderService.getOrder(orderId);
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<Void> handleOrderNotFound() {
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorDto> handleAccessDenied(Exception ex) {
        // Set the content type explicitly so the body is written even when Accept excludes JSON.
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorDto(ex.getMessage()));
    }
}
