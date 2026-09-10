package com.codewithmosh.store.products;

import com.codewithmosh.store.common.ErrorDto;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;

// Beyond the course (API docs): tag, summaries, responses and parameter descriptions for Swagger UI.
@Tag(name = "Products")
@AllArgsConstructor
@RestController
@RequestMapping("/products")
public class ProductController {
    private final ProductRepository productRepository;
    private final ProductMapper productMapper;
    private final CategoryRepository categoryRepository;

    @Operation(summary = "List products (public)",
               description = "Returns the catalogue, optionally filtered by category.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The products (an empty array for an unknown category)."),
        @ApiResponse(responseCode = "400", description = "`categoryId` is not a valid number.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Invalid request parameter.\"}")))
    })
    @GetMapping
    public List<ProductDto> getAllProducts(
        @Parameter(description = "Category ID to filter by; the seed data has 1 Produce, 2 Dairy, 3 Bakery, 4 Meat & Seafood, 5 Pantry Staples, 6 Beverages.", example = "1")
        @RequestParam(name = "categoryId", required = false) Byte categoryId
    ) {
        List<Product> products;
        if (categoryId != null) {
            products = productRepository.findByCategoryId(categoryId);
        } else {
            products = productRepository.findAllWithCategory();
        }

        return products.stream().map(productMapper::toDto).toList();
    }

    @Operation(summary = "Get a product (public)",
               description = "Returns one product by ID.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The product."),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content)
    })
    @GetMapping("/{id}")
    public ResponseEntity<ProductDto> getProduct(@Parameter(description = "Product ID.", example = "1") @PathVariable Long id) {
        var product = productRepository.findById(id).orElse(null);
        if (product == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(productMapper.toDto(product));
    }

    @Operation(summary = "Create a product (admin only)",
               description = "Adds a product to the catalogue. Requires the ADMIN role. An `id` in the body is ignored; the `Location` header points at `/products/{id}`.")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "The created product; `Location` header set.",
                     headers = @Header(name = "Location", description = "URL of the new product.", schema = @Schema(type = "string"))),
        @ApiResponse(responseCode = "400", description = "Validation failed (a field-to-message map) or unknown `categoryId` (empty body).",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"price\": \"Price must be greater than zero.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}")))
    })
    @PostMapping
    public ResponseEntity<ProductDto> createProduct(
        // Fix beyond the course: validate the request body (see constraints on ProductDto).
        @Valid @RequestBody ProductDto productDto,
        UriComponentsBuilder uriBuilder) {
        var category = categoryRepository.findById(productDto.getCategoryId()).orElse(null);
        if (category == null) {
            return ResponseEntity.badRequest().build();
        }

        var product = productMapper.toEntity(productDto);
        product.setCategory(category);
        productRepository.save(product);
        productDto.setId(product.getId());

        var uri = uriBuilder.path("/products/{id}").buildAndExpand(productDto.getId()).toUri();

        return ResponseEntity.created(uri).body(productDto);
    }

    @Operation(summary = "Update a product (admin only)",
               description = "Replaces name, price, description and category. Requires the ADMIN role. An `id` in the body is ignored.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The updated product."),
        @ApiResponse(responseCode = "400", description = "Validation failed (a field-to-message map) or unknown `categoryId` (empty body).",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"name\": \"Name is required.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content)
    })
    @PutMapping("/{id}")
    public ResponseEntity<ProductDto> updateProduct(
        @Parameter(description = "Product ID.", example = "1") @PathVariable Long id,
        // Fix beyond the course: validate the request body (see constraints on ProductDto).
        @Valid @RequestBody ProductDto productDto) {
        var category = categoryRepository.findById(productDto.getCategoryId()).orElse(null);
        if (category == null) {
            return ResponseEntity.badRequest().build();
        }

        var product = productRepository.findById(id).orElse(null);
        if (product == null) {
            return ResponseEntity.notFound().build();
        }

        productMapper.update(productDto, product);
        product.setCategory(category);
        productRepository.save(product);
        productDto.setId(product.getId());

        return ResponseEntity.ok(productDto);
    }

    @Operation(summary = "Delete a product (admin only)",
               description = "Removes a product from the catalogue. Requires the ADMIN role. A product that appears in an order cannot be deleted.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Deleted.", content = @Content),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content),
        @ApiResponse(responseCode = "409", description = "The product is referenced by existing orders.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Product is referenced by existing orders and cannot be deleted.\"}")))
    })
    // Fix beyond the course: ResponseEntity<?> (was <Void>) so the 409 below can carry an ErrorDto body.
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteProduct(@Parameter(description = "Product ID.", example = "1") @PathVariable Long id) {
        var product = productRepository.findById(id).orElse(null);
        if (product == null) {
            return ResponseEntity.notFound().build();
        }

        // Fix beyond the course: order_items has a FK to products, so deleting an ordered product used to be a 500.
        try {
            productRepository.delete(product);
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .body(new ErrorDto("Product is referenced by existing orders and cannot be deleted."));
        }

        return ResponseEntity.noContent().build();
    }
}
