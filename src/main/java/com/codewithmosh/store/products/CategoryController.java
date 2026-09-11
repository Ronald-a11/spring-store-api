package com.codewithmosh.store.products;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Products")
@AllArgsConstructor
@RestController
@RequestMapping("/categories")
public class CategoryController {
    private final CategoryRepository categoryRepository;

    @Operation(summary = "List categories (public)",
               description = "Returns every product category ordered by ID; use the `id` as `categoryId` in `GET /products` and in product bodies.")
    @SecurityRequirements
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The categories, ordered by ID.",
                     content = @Content(array = @ArraySchema(schema = @Schema(implementation = CategoryDto.class)),
                                        examples = @ExampleObject(value = "[{\"id\": 1, \"name\": \"Produce\"}, {\"id\": 2, \"name\": \"Dairy\"}]")))
    })
    @GetMapping
    public List<CategoryDto> getAllCategories() {
        return categoryRepository.findAll(Sort.by("id"))
                .stream()
                .map(category -> new CategoryDto(category.getId(), category.getName()))
                .toList();
    }
}
