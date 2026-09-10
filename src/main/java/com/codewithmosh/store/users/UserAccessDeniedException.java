package com.codewithmosh.store.users;

// Fix beyond the course: thrown when a user touches another user's account (mirrors the orders feature's message style).
public class UserAccessDeniedException extends RuntimeException {
    public UserAccessDeniedException() {
        super("You don't have access to this user.");
    }

    // Fix beyond the course: a specific reason (UserService.updateUser refusing an ADMIN_EMAILS address).
    public UserAccessDeniedException(String message) {
        super(message);
    }
}
