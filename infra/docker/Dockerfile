# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production deps only
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
