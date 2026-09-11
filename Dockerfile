# syntax=docker/dockerfile:1

# Both base images are pinned by digest so a rebuild can't silently change the JDK.
FROM eclipse-temurin:25-jdk@sha256:dcf835e52330939b6c9f90ecab8aafcbcaa8fbf48423db44de884cf978c10144 AS build
WORKDIR /workspace

# Build files first, so the dependency layer stays cached until pom.xml changes.
COPY .mvn/ .mvn/
COPY mvnw mvnw.cmd pom.xml ./
# Checksum of the Maven tarball that mvnw downloads (mvnw.cmd uses the zip, which hashes differently).
RUN printf '\ndistributionSha256Sum=%s\n' \
        7a9cdf674fc1703d6382f5f330b3d110ea1b512b51f1652846d9e4e8a588d766 \
        >> .mvn/wrapper/maven-wrapper.properties \
    && sed -i 's/\r$//' mvnw \
    && chmod +x mvnw \
    && ./mvnw -B -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -q -DskipTests package \
    && cp target/*.jar app.jar

FROM eclipse-temurin:25-jre@sha256:15090d159279e5c158473eccb48cd87f57b3e3a47511a797eb5a7a7ea6f86b0f

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build --chown=app:app /workspace/app.jar /app/app.jar

USER app
EXPOSE 8080

ENV SPRING_PROFILES_ACTIVE=prod

# Heap capped at half the container memory; exit on OOM so the platform restarts the service.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

# exec makes java PID 1 so it gets SIGTERM and shuts down gracefully. PORT is set by the platform.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar --server.port=${PORT:-8080}"]
