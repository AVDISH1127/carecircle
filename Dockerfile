# CareCircle - single-stage, slim production image for Cloud Run.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

# Run as the built-in non-root user; keep data on a writable path.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV DATA_FILE=/app/data/carecircle.json

EXPOSE 8080
CMD ["node", "src/server.js"]
