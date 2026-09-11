package com.codewithmosh.store;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.jwt.secret=test-only-secret-not-for-production-0123456789abcdef",
        "spring.docker.compose.skip.in-tests=false"
})
class StoreApplicationTests {

    @Test
    void contextLoads() {
    }

}
