FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node auth.mjs map-store.mjs server.mjs README.md LICENSE ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/content/.folder-wiki && chown -R node:node /app/content

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    CONTENT_ROOT=/app/content \
    RUNTIME_ROOT=/app/content/.folder-wiki

USER node
EXPOSE 4173
VOLUME ["/app/content"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
