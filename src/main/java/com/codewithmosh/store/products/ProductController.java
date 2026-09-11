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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.List;

@Tag(name = "Products")
@AllArgsConstructor
@RestController
@RequestMapping("/products")
public class ProductController {
    private final ProductRepository productRepository;
    private final ProductMapper productMapper;
    private final CategoryRepository categoryRepository;
    private final ProductImageRepository imageRepository;
    private final ProductImageService productImageService;

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
        @Parameter(description = "Category ID to filter by; the seed data has 1 Produce, 2 Dairy, 3 Bakery, 4 Meat & Seafood, 5 Pantry Staples, 6 Beverages.", example = "1", schema = @Schema(type = "integer", format = "int32"))
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
               description = "Adds a product to the catalogue. Requires the ADMIN role. `stock` defaults to 0; `id` and `imageUrl` in the body are ignored. The `Location` header points at `/products/{id}`.")
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
        @Valid @RequestBody ProductDto productDto,
        UriComponentsBuilder uriBuilder) {
        var category = categoryRepository.findById(productDto.getCategoryId()).orElse(null);
        if (category == null) {
            return ResponseEntity.badRequest().build();
        }

        var product = productMapper.toEntity(productDto);
        product.setCategory(category);
        productRepository.save(product);

        var uri = uriBuilder.path("/products/{id}").buildAndExpand(product.getId()).toUri();

        return ResponseEntity.created(uri).body(productMapper.toDto(product));
    }

    @Operation(summary = "Update a product (admin only)",
               description = "Replaces name, price, description and category. Requires the ADMIN role. `id`, `stock` and `imageUrl` in the body are ignored.")
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

        return ResponseEntity.ok(productMapper.toDto(product));
    }

    @Operation(summary = "Set a product's stock (admin only)",
               description = "Sets the number of units in stock. Requires the ADMIN role. Checkout takes units out of stock and a canceled order puts them back.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The updated product."),
        @ApiResponse(responseCode = "400", description = "Validation failed: a field-to-message map.",
                     content = @Content(schema = @Schema(type = "object"), examples = @ExampleObject(value = "{\"stock\": \"Stock cannot be negative.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content)
    })
    @PutMapping("/{id}/stock")
    public ResponseEntity<ProductDto> updateStock(
        @Parameter(description = "Product ID.", example = "1") @PathVariable Long id,
        @Valid @RequestBody UpdateStockRequest request) {
        var product = productRepository.findById(id).orElse(null);
        if (product == null) {
            return ResponseEntity.notFound().build();
        }

        product.setStock(request.getStock());
        productRepository.save(product);

        return ResponseEntity.ok(productMapper.toDto(product));
    }

    @Operation(summary = "Upload a product photo (admin only)",
               description = "Stores a JPEG, PNG or WebP photo of up to 2 MB as the product's photo, replacing the previous one. Requires the ADMIN role. Send it as multipart form data in a part named `file`.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The product with its new `imageUrl`."),
        @ApiResponse(responseCode = "400", description = "The `file` part is missing or is not a JPEG, PNG or WebP image.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"The photo must be a JPEG, PNG or WebP image.\"}"))),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content),
        @ApiResponse(responseCode = "413", description = "The photo is larger than 2 MB.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"The photo must be 2 MB or smaller.\"}")))
    })
    @PutMapping(value = "/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductDto uploadImage(
        @Parameter(description = "Product ID.", example = "1") @PathVariable Long id,
        @RequestPart("file") MultipartFile file) throws IOException {
        var product = productImageService.replaceImage(id, file);
        return productMapper.toDto(product);
    }

    @Operation(summary = "Remove a product photo (admin only)",
               description = "Deletes the product's photo. Requires the ADMIN role. A product without a photo also answers 204.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Removed.", content = @Content),
        @ApiResponse(responseCode = "401", description = "Missing, expired or invalid access token (empty body).", content = @Content),
        @ApiResponse(responseCode = "403", description = "The caller is not an admin.",
                     content = @Content(schema = @Schema(implementation = ErrorDto.class), examples = @ExampleObject(value = "{\"error\": \"Access denied.\"}"))),
        @ApiResponse(responseCode = "404", description = "No product with this ID (empty body).", content = @Content)
    })
    @DeleteMapping("/{id}/image")
    public ResponseEntity<Void> removeImage(@Parameter(description = "Product ID.", example = "1") @PathVariable Long id) {
        productImageService.removeImage(id);
        return ResponseEntity.noContent().build();
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
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteProduct(@Parameter(description = "Product ID.", example = "1") @PathVariable Long id) {
        var product = productRepository.findById(id).orElse(null);
        if (product == null) {
            return ResponseEntity.notFound().build();
        }

        var image = product.getImage();
        try {
            productRepository.delete(product);
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .body(new ErrorDto("Product is referenced by existing orders and cannot be deleted."));
        }

        if (image != null) {
            imageRepository.deleteById(image.getId());
        }

        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<Void> handleProductNotFound() {
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(InvalidImageException.class)
    public ResponseEntity<ErrorDto> handleInvalidImage(Exception ex) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(new ErrorDto(ex.getMessage()));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ErrorDto> handleMissingFile() {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(new ErrorDto("Choose a photo to upload."));
    }
}
