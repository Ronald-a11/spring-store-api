package com.codewithmosh.store.products;

import com.codewithmosh.store.common.SecurityRules;
import com.codewithmosh.store.users.Role;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.stereotype.Component;

@Component
public class ProductSecurityRules implements SecurityRules {
    @Override
    public void configure(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry registry) {
        registry.requestMatchers(HttpMethod.GET, "/products/**").permitAll()
                // Fix beyond the course: HEAD is the read-only twin of GET and should be public too.
                .requestMatchers(HttpMethod.HEAD, "/products/**").permitAll()
                // Fix beyond the course: the category list (CategoryController) is public like the catalogue, GET only.
                .requestMatchers(HttpMethod.GET, "/categories").permitAll()
                .requestMatchers(HttpMethod.POST, "/products/**").hasRole(Role.ADMIN.name())
                .requestMatchers(HttpMethod.PUT, "/products/**").hasRole(Role.ADMIN.name())
                .requestMatchers(HttpMethod.DELETE, "/products/**").hasRole(Role.ADMIN.name());
    }
}
