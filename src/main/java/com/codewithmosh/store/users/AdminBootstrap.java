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
 * the access token carries the role.
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
            userRepository.findByEmail(email).ifPresent(user -> {
                if (user.getRole() != Role.ADMIN) {
                    user.setRole(Role.ADMIN);
                    userRepository.save(user);
                    promoted.add(email);
                }
            });
        }

        log.info("ADMIN_EMAILS lists {} e-mail(s); promoted {} existing user(s) to ADMIN: {}",
                emails.size(), promoted.size(), promoted);
    }
}
