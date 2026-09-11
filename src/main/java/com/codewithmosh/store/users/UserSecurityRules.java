package com.codewithmosh.store.users;

import com.codewithmosh.store.common.SecurityRules;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.stereotype.Component;

@Component
public class UserSecurityRules implements SecurityRules {
    @Override
    public void configure(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry registry) {
        registry.requestMatchers(HttpMethod.POST, "/users").permitAll();
        registry.requestMatchers(HttpMethod.GET, "/users").hasRole(Role.ADMIN.name());
        // Spring MVC serves HEAD through the GET handler, so it needs the same rule.
        registry.requestMatchers(HttpMethod.HEAD, "/users").hasRole(Role.ADMIN.name());
    }
}
