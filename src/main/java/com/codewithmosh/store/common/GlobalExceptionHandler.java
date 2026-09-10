package com.codewithmosh.store.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.HashMap;
import java.util.Map;

// Fix beyond the course: @Slf4j so the last-resort handler below can log the real exception.
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorDto> handleUnreadableMessage() {
        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON (it used to fall through to a Whitelabel page).
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(
            new ErrorDto("Invalid request body")
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationErrors(
            MethodArgumentNotValidException exception
    ) {
        var errors = new HashMap<String, String>();

        exception.getBindingResult().getFieldErrors().forEach(error -> {
            errors.put(error.getField(), error.getDefaultMessage());
        });

        // Fix beyond the course: preset application/json so the field errors are written even when Accept excludes JSON.
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(errors);
    }

    // Fix beyond the course: the handlers below give framework errors a proper status (they used to end as a blank 401) and preset application/json so the body is written whatever Accept says.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorDto> handleTypeMismatch() {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(
            new ErrorDto("Invalid request parameter.")
        );
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorDto> handleMethodNotSupported() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).contentType(MediaType.APPLICATION_JSON).body(
            new ErrorDto("Method not allowed.")
        );
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorDto> handleMediaTypeNotSupported() {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).contentType(MediaType.APPLICATION_JSON).body(
            new ErrorDto("Unsupported media type.")
        );
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<Void> handleMediaTypeNotAcceptable() {
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).build();
    }

    @ExceptionHandler(MissingRequestCookieException.class)
    public ResponseEntity<Void> handleMissingCookie() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorDto> handleDataIntegrityViolation() {
        // Fix beyond the course: preset application/json so the error body is written even when Accept excludes JSON (it used to end as a 500).
        return ResponseEntity.status(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body(
            new ErrorDto("Request conflicts with existing data.")
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorDto> handleUnexpectedError(Exception exception) throws Exception {
        // Fix beyond the course: rethrow what Spring Security (401/403) and Spring MVC (e.g. 404) already handle with the right status.
        if (exception instanceof AccessDeniedException
                || exception instanceof AuthenticationException
                || exception instanceof ErrorResponse) {
            throw exception;
        }

        log.error("Unexpected error", exception);

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
            new ErrorDto("Unexpected error.")
        );
    }
}
