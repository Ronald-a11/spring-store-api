package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@Tag(name = "Products")
@AllArgsConstructor
@RestController
@RequestMapping("/images")
public class ProductImageController {
    private final ProductImageRepository imageRepository;

    @Operation(summary = "Get a product photo (public)",
               description = "Serves a photo uploaded with PUT /products/{id}/image. Use the product's `imageUrl`: every upload gets a new ID, so the response can be cached for a year.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The photo.",
                     content = @Content(mediaType = "image/*", schema = @Schema(type = "string", format = "binary"))),
        @ApiResponse(responseCode = "404", description = "No photo with this ID (empty body).", content = @Content)
    })
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> getImage(@Parameter(description = "Photo ID, from a product's `imageUrl`.", example = "1") @PathVariable Long id) {
        return imageRepository.findById(id)
                .map(image -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(image.getContentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .body(image.getData()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
