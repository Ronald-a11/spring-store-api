# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: JDK 25 + the project's Maven wrapper.
# The wrapper is "only-script" (no maven-wrapper.jar), so ./mvnw downloads
# Maven 3.9.9 itself on first use and checks it against the SHA-256 pinned
# below; that happens inside the cached dependency layer.
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
# Pin the checksum of the Maven distribution the wrapper downloads. This image has
# no unzip/curl/wget, so mvnw compiles its own Java downloader and fetches the
# *tar.gz* (see "select .zip or .tar.gz" in mvnw), whereas mvnw.cmd always fetches
# the zip; the two archives hash differently, so the value is set here - next to
# the digest-pinned image that makes the tar.gz path deterministic - instead of in
# maven-wrapper.properties, where it would break one of the local wrappers.
# The value is the SHA-256 of apache-maven-3.9.9-bin.tar.gz, computed from a
# download verified against Apache's published .sha512; update it together with
# distributionUrl. mvnw is LF in the repo (.gitattributes), but normalise anyway
# so a CRLF checkout cannot break the shebang, and make sure it is executable.
RUN printf '\ndistributionSha256Sum=%s\n' \
        7a9cdf674fc1703d6382f5f330b3d110ea1b512b51f1652846d9e4e8a588d766 \
        >> .mvn/wrapper/maven-wrapper.properties \
    && sed -i 's/\r$//' mvnw \
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

# JVM sizing. The heap is capped at 50% of the container's memory limit (the JDK
# default is 25%), and an OutOfMemoryError exits the JVM so the platform's restart
# policy replaces the process instead of leaving a wedged one behind. 50% rather
# than the usual 75% because this JVM's non-heap footprint (metaspace, code cache,
# threads, GC, native) measures ~290 MiB: at a 1 GiB limit a 75% heap (768 MiB)
# could grow past the cgroup limit and be OOM-killed by the kernel (exit 137)
# before an OutOfMemoryError is ever thrown, so ExitOnOutOfMemoryError would never
# fire; a 512 MiB heap leaves ~220 MiB of headroom (live heap is ~40 MiB). The
# limit the JVM sees is the service's cgroup limit, so set an explicit memory limit
# on the Railway service (1 GB is plenty); without one the "limit" is the plan
# maximum. Override per service with a JAVA_OPTS variable.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

# Spring Boot does not read PORT on its own; Railway (and friends) inject it.
# The `sh -c` form is required so ${PORT:-8080} and $JAVA_OPTS expand at container
# start; `exec` makes java PID 1 so the SIGTERM sent on stop/redeploy reaches the
# JVM and Spring Boot's graceful shutdown (the default since 3.4) runs instead of
# the shell swallowing the signal until the JVM is killed after the grace period.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar --server.port=${PORT:-8080}"]
