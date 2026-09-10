package com.codewithmosh.store;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// Fix beyond the course: JwtConfig refuses to start on a blank or short secret, so the context
// load needs one. This throw-away test value keeps `mvn verify` working on a fresh clone with
// no .env and no JWT_SECRET in the environment (the 3307 database container is still required).
@SpringBootTest(properties = "spring.jwt.secret=test-only-secret-not-for-production-0123456789abcdef")
class StoreApplicationTests {

    @Test
    void contextLoads() {
    }

}
