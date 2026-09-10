package com.codewithmosh.store.users;

// Fix beyond the course: thrown when a user touches another user's account (mirrors the orders feature's message style).
public class UserAccessDeniedException extends RuntimeException {
    public UserAccessDeniedException() {
        super("You don't have access to this user.");
    }
}
