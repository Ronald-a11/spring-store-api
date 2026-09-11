package com.codewithmosh.store.users;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Creates the default admin account if it is missing and promotes existing users listed in ADMIN_EMAILS.
 * A promoted user gets the new role at their next login.
 */
@Slf4j
@AllArgsConstructor
@Component
public class AdminBootstrap {
    private final UserRepository userRepository;
    private final AdminProperties adminProperties;
    private final PasswordEncoder passwordEncoder;

    @EventListener(ApplicationReadyEvent.class)
    public void setUpAdmins() {
        createDefaultAdmin();
        promoteConfiguredAdmins();
    }

    private void createDefaultAdmin() {
        var email = adminProperties.getDefaultEmail();
        var password = adminProperties.getDefaultPassword();
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            return;
        }
        email = email.trim().toLowerCase(Locale.ROOT);

        // An exception thrown from the ready event would shut down the application, so log and move on.
        try {
            var existing = userRepository.findByEmail(email);
            if (existing.isPresent()) {
                // Leave the account alone so a changed password isn't reset on every start.
                if (existing.get().getRole() != Role.ADMIN) {
                    log.warn("DEFAULT_ADMIN_EMAIL {} belongs to a USER account; add it to ADMIN_EMAILS to promote it",
                            email);
                }
                return;
            }

            var admin = User.builder()
                    .name("Admin")
                    .email(email)
                    .password(passwordEncoder.encode(password))
                    .role(Role.ADMIN)
                    .build();
            userRepository.save(admin);
            log.info("Created the default admin account {}", email);
        } catch (RuntimeException ex) {
            log.error("Could not create the default admin account {}; the next start retries", email, ex);
        }
    }

    private void promoteConfiguredAdmins() {
        var emails = adminProperties.emailSet();
        if (emails.isEmpty()) {
            return;
        }

        var promoted = new ArrayList<String>();
        for (var email : emails) {
            try {
                userRepository.findByEmail(email).ifPresentOrElse(user -> {
                    if (user.getRole() != Role.ADMIN) {
                        user.setRole(Role.ADMIN);
                        userRepository.save(user);
                        promoted.add(email);
                    }
                }, () -> log.warn("ADMIN_EMAILS entry {} has no account yet; whoever registers it becomes ADMIN"
                        + " - register it first or take it off the list", email));
            } catch (RuntimeException ex) {
                log.error("Could not promote {} to ADMIN; the next start retries", email, ex);
            }
        }

        log.info("ADMIN_EMAILS lists {} e-mail(s); promoted {} existing user(s) to ADMIN: {}",
                emails.size(), promoted.size(), promoted);
    }
}
