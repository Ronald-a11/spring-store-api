package com.codewithmosh.store.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AllArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@AllArgsConstructor
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        var authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        var token = authHeader.substring(7);
        var jwt = jwtService.parseToken(token);
        // A signed token can still have malformed claims (e.g. an unknown role); treat it as invalid.
        UsernamePasswordAuthenticationToken authentication = null;
        try {
            if (jwt != null && !jwt.isExpired() && jwt.isAccessToken()) {
                authentication = new UsernamePasswordAuthenticationToken(
                    jwt.getUserId(),
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getRole()))
                );
            }
        } catch (RuntimeException e) {
            authentication = null;
        }
        if (authentication == null) {
            filterChain.doFilter(request, response);
            return;
        }

        authentication.setDetails(
            new WebAuthenticationDetailsSource().buildDetails(request)
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }
}
