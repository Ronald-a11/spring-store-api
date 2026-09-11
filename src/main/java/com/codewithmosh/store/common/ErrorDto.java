package com.codewithmosh.store.common;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;

@Schema(description = "Error body of most 4xx/5xx responses.")
@AllArgsConstructor
@Data
public class ErrorDto {
    @Schema(description = "Human-readable error message.", example = "Access denied.")
    private String error;
}
