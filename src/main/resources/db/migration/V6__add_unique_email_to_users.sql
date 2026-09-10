-- Fix beyond the course: e-mails must be unique; the application-level check alone lets concurrent requests create duplicates.
ALTER TABLE users
    ADD CONSTRAINT users_email_unique UNIQUE (email);
