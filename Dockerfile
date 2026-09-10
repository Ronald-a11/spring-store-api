# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: JDK 25 + the project's Maven wrapper.
# The wrapper is "only-script" (no maven-wrapper.jar), so ./mvnw downloads
# Maven 3.9.9 itself on first use; that happens inside the cached dependency
# layer below.
#
# Both base images are pinned by digest (manifest-list digests of the 25-jdk /
# 25-jre tags on 2026-09-10, JDK 25.0.4+7 on Ubuntu 26.04) so a rebuild on
# Railway cannot silently pick up a different JDK patch or Ubuntu base than the
# locally validated image. To move to a newer JDK, refresh both with
#   docker buildx imagetools inspect eclipse-temurin:25-jdk   (and :25-jre)
# and rebuild locally first.
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk@sha256:dcf835e52330939b6c9f90ecab8aafcbcaa8fbf48423db44de884cf978c10144 AS build
WORKDIR /workspace

# Wrapper + pom first so the dependency download is cached until pom.xml changes.
COPY .mvn/ .mvn/
COPY mvnw mvnw.cmd pom.xml ./
# mvnw is LF in the repo (.gitattributes), but normalise anyway so a CRLF
# checkout cannot break the shebang, and make sure it is executable.
RUN sed -i 's/\r$//' mvnw \
    && chmod +x mvnw \
    && ./mvnw -B -q dependency:go-offline

# Sources last: only this layer is rebuilt on a code change.
COPY src/ src/
RUN ./mvnw -B -q -DskipTests package \
    && cp target/*.jar app.jar

# ---------------------------------------------------------------------------
# Runtime stage: JRE 25 only, non-root user.
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre@sha256:15090d159279e5c158473eccb48cd87f57b3e3a47511a797eb5a7a7ea6f86b0f

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build --chown=app:app /workspace/app.jar /app/app.jar

USER app
EXPOSE 8080

# The image defaults to the prod profile (application.yaml activates "dev", but an
# environment variable outranks it). Without this, a service that forgets
# SPRING_PROFILES_ACTIVE=prod would dial application-dev.yaml's localhost:3307 and
# crash-loop; with it, a missing SPRING_DATASOURCE_URL fails fast on an unresolved
# placeholder instead. Override with -e SPRING_PROFILES_ACTIVE=dev for a local run.
ENV SPRING_PROFILES_ACTIVE=prod

# Spring Boot does not read PORT on its own; Railway (and friends) inject it.
# The `sh -c` form is required so ${PORT:-8080} expands at container start.
ENTRYPOINT ["sh", "-c", "java -jar /app/app.jar --server.port=${PORT:-8080}"]
