package com.codewithmosh.store.users;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Configuration
@ConfigurationProperties(prefix = "admin")
@Data
public class AdminProperties {
    private String emails;

    public Set<String> emailSet() {
        if (emails == null || emails.isBlank()) {
            return Set.of();
        }
        var normalised = Arrays.stream(emails.split(","))
                .map(String::trim)
                .filter(email -> !email.isEmpty())
                .map(email -> email.toLowerCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        return Collections.unmodifiableSet(normalised);
    }

    public boolean isAdmin(String email) {
        return email != null && emailSet().contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
