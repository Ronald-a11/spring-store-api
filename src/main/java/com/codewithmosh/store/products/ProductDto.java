package com.codewithmosh.store.products;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ProductDto {
    private Long id;

    // Fix beyond the course: validate product input on POST/PUT (the controller uses @Valid).
    @NotBlank(message = "Name is required.")
    @Size(max = 255, message = "Name must be less than 255 characters.")
    private String name;

    @NotNull(message = "Price is required.")
    @Positive(message = "Price must be greater than zero.")
    @Digits(integer = 8, fraction = 2, message = "Price must have at most 2 decimals.")
    private BigDecimal price;

    @NotBlank(message = "Description is required.")
    private String description;

    @NotNull(message = "Category ID is required.")
    private Byte categoryId;
}
