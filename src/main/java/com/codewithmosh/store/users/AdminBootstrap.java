package com.codewithmosh.store.users;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;

/**
 * Fix beyond the course: promotes existing accounts to {@link Role#ADMIN} once the application is ready. Every
 * e-mail in the {@code ADMIN_EMAILS} environment variable (a Railway service variable or a line in {@code .env};
 * parsed by {@link AdminProperties}) that already has an account with another role is updated, so an admin can be
 * created without a database client: register through the API or the storefront, add the e-mail to the variable,
 * redeploy. Accounts that are already ADMIN are left alone; e-mails without an account are skipped (they become
 * ADMIN when they register, see {@link UserService#registerUser}); an unset or empty variable is a no-op. Only the
 * e-mails and the count are logged, never passwords. The role takes effect at the account's next login, because
 * the access token carries the role. A lookup or save that fails is logged at ERROR and skipped rather than ending
 * the application (the routine is idempotent, so the next start retries it).
 * <p>
 * There is no e-mail verification: a listed e-mail that has no account yet goes to whoever registers it, so the
 * account should exist before its e-mail is listed (README, "Making an admin"); {@link UserService#updateUser}
 * refuses to move a USER's account onto a listed address for the same reason.
 */
@Slf4j
@AllArgsConstructor
@Component
public class AdminBootstrap {
    private final UserRepository userRepository;
    private final AdminProperties adminProperties;

    @EventListener(ApplicationReadyEvent.class)
    public void promoteConfiguredAdmins() {
        var emails = adminProperties.emailSet();
        if (emails.isEmpty()) {
            return;
        }

        var promoted = new ArrayList<String>();
        for (var email : emails) {
            // Fix beyond the course: a lookup or save that fails (a database hiccup right after start-up) is logged and
            // skipped; thrown out of the ready event it would close the context and end an otherwise healthy application.
            try {
                userRepository.findByEmail(email).ifPresent(user -> {
                    if (user.getRole() != Role.ADMIN) {
                        user.setRole(Role.ADMIN);
                        userRepository.save(user);
                        promoted.add(email);
                    }
                });
            } catch (RuntimeException ex) {
                log.error("Could not promote {} to ADMIN; the next start retries", email, ex);
            }
        }

        log.info("ADMIN_EMAILS lists {} e-mail(s); promoted {} existing user(s) to ADMIN: {}",
                emails.size(), promoted.size(), promoted);
    }
}
