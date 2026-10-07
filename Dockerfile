# The Voucher Ledger as a small container: a static-ish Rust binary on a
# distroless base (no shell, runs as an unprivileged user). Data lives in
# /data: the signing key, the state, the access code, and API tokens.
FROM rust:1-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p voucher-ledger \
 && mkdir -p /data && chown 65532:65532 /data

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/voucher-ledger /usr/local/bin/voucher-ledger
COPY --from=build --chown=65532:65532 /data /data
ENV VOUCHER_DATA_DIR=/data \
    VOUCHER_LISTEN=0.0.0.0:8787
VOLUME /data
EXPOSE 8787
USER nonroot
ENTRYPOINT ["/usr/local/bin/voucher-ledger"]
