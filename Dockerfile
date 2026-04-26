FROM node:22-alpine AS native-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY .output/ .output/
# Install better-sqlite3 from source at the exact version Nuxt Content bundled,
# then replace the stripped binary with the freshly compiled one.
RUN VERSION=$(node -e "console.log(require('./.output/server/node_modules/better-sqlite3/package.json').version)") && \
    npm install --prefix /tmp/bsqlite "better-sqlite3@$VERSION" && \
    cp -r /tmp/bsqlite/node_modules/better-sqlite3/build .output/server/node_modules/better-sqlite3/

FROM node:22-alpine
WORKDIR /app
COPY --from=native-builder /app/.output/ .output/
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
