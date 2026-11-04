FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY library ./library
COPY astro.config.mjs tsconfig.json ./
RUN mkdir -p data
ARG SITE_URL
ARG CMS_REPOSITORY
ARG CMS_BRANCH=main
ENV SITE_URL=$SITE_URL CMS_REPOSITORY=$CMS_REPOSITORY CMS_BRANCH=$CMS_BRANCH
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=build /app/dist ./dist
COPY --from=build /app/library ./library
COPY server.mjs local-storage.mjs editor-api.mjs ./
COPY src/lib/site-shell.mjs ./src/lib/site-shell.mjs
EXPOSE 8080
CMD ["node","server.mjs"]
