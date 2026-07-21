FROM postgres:16-alpine

# pgvector를 PG16용으로 소스 빌드 (Alpine 패키지는 PG18용이므로)
RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
    git \
    gcc \
    musl-dev \
    make \
    clang21 \
    llvm21 \
    ; \
    git clone --branch v0.8.1 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector; \
    cd /tmp/pgvector; \
    make USE_PGXS=1; \
    make USE_PGXS=1 install; \
    cd /; \
    rm -rf /tmp/pgvector; \
    apk del .build-deps
