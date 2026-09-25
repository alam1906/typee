FROM oven/bun:1.4.0 AS web-build

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

FROM alpine:3.21 AS pocketbase-download

ARG PB_VERSION=0.40.4
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip \
    && case "$TARGETARCH" in amd64|arm64) ;; *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1;; esac \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pocketbase.zip \
    && unzip -q /tmp/pocketbase.zip pocketbase -d /pb \
    && chmod +x /pb/pocketbase

FROM nginx:stable-alpine

RUN apk add --no-cache bash ca-certificates tini
COPY --from=web-build /app/apps/web/build/ /usr/share/nginx/html/
COPY --from=pocketbase-download /pb/pocketbase /pb/pocketbase
COPY apps/pocketbase/pb_hooks /pb/pb_hooks
COPY apps/pocketbase/pb_migrations /pb/pb_migrations
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/start.sh /usr/local/bin/start-typee
RUN chmod +x /usr/local/bin/start-typee

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/health && wget -q -O /dev/null http://127.0.0.1/api/health
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/start-typee"]

