# Kalo: one image serving the PWA and the /api/v1 Rust API on port 8080.
# Build from the repository root: docker build -t kalo .

FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
# Sign-in page opened by "Se connecter", e.g. your Better Auth login page (/login).
ARG VITE_SIGN_IN_URL=""
ENV VITE_SIGN_IN_URL=$VITE_SIGN_IN_URL
RUN npm run build

FROM rust:1.99.1-bookworm AS api
WORKDIR /src
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates crates
COPY apps/api apps/api
RUN cargo build --release --locked -p caloryst-api

FROM debian:bookworm-slim
# TLS for Open Food Facts requests (native-tls uses OpenSSL on Linux).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 --no-create-home kalo
WORKDIR /app
COPY --from=api /src/target/release/caloryst-api /app/caloryst-api
COPY --from=web /web/dist /app/web
ENV STATIC_DIR=/app/web PORT=8080 RUST_LOG=info
USER kalo
EXPOSE 8080
CMD ["/app/caloryst-api"]
