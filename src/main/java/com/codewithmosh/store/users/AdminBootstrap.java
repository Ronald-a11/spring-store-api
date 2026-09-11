package com.codewithmosh.store.users;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;

/** Promotes existing users listed in ADMIN_EMAILS; the new role takes effect at their next login. */
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
            // An exception thrown from the ready event would shut down the application, so log and move on.
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
