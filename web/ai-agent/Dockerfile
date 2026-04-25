# Build context: `web/`  →  docker compose build ai-agent
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY ai-agent/package.json ./
RUN npm install
COPY ai-agent/tsconfig.json ./
COPY ai-agent/src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
COPY ai-agent/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
