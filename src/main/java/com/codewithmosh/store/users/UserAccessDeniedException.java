package com.codewithmosh.store.users;

public class UserAccessDeniedException extends RuntimeException {
    public UserAccessDeniedException() {
        super("You don't have access to this user.");
    }

    public UserAccessDeniedException(String message) {
        super(message);
    }
}
