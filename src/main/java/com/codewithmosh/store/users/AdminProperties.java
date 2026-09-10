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

/**
 * Fix beyond the course: the e-mails that are granted the {@link Role#ADMIN} role. Bound from {@code admin.emails}
 * (application.yaml), which reads the {@code ADMIN_EMAILS} environment variable - a Railway service variable in
 * production, a line in {@code .env} locally. The value is a comma-separated list; entries are trimmed and matched
 * case-insensitively, so {@code "Ann@Example.com, bob@example.com"} lists two admins. Unset or empty: nobody.
 * The course grants ADMIN only by editing the {@code users.role} column.
 * <p>
 * Used by {@link UserService#registerUser} (a listed e-mail registers straight as ADMIN) and by
 * {@link AdminBootstrap} (listed e-mails that already have an account are promoted at start-up).
 */
@Configuration
@ConfigurationProperties(prefix = "admin")
@Data
public class AdminProperties {
    private String emails;

    /** The normalised list in the variable's order: trimmed, lower-cased, blank entries dropped; empty when unset. */
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

    /** True when the e-mail is listed (ignoring case and surrounding whitespace). */
    public boolean isAdmin(String email) {
        return email != null && emailSet().contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
