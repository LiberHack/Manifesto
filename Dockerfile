FROM node:22-slim

WORKDIR /app

# Copy pre-built Nitro output only
COPY .output/ .output/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
