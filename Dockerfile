# syntax=docker/dockerfile:1
# Agent Console in one container: the web app, Claude Code and Codex.
#
#   docker compose up -d        (see compose.yaml and the README)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build: server, web app and native modules ------------------------------------------
FROM ${NODE_IMAGE} AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- run --------------------------------------------------------------------------------
FROM ${NODE_IMAGE}
ARG CLAUDE_CODE_VERSION=2.1.308
# The user the agents run as. Set these to your own ids (id -u, id -g) so that files the agents
# write in mounted folders belong to you.
ARG UID=1000
ARG GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini git tmux ripgrep ca-certificates curl openssh-client procps less python3 \
 && rm -rf /var/lib/apt/lists/*

# Claude Code; Codex comes with the app's own npm dependencies.
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
 && npm cache clean --force

# The image's `node` user, with your ids.
RUN groupmod -o -g ${GID} node \
 && usermod -o -u ${UID} -g ${GID} node \
 && mkdir -p /workspace \
 && chown node:node /workspace /home/node

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8790 \
    HOME=/home/node \
    LANG=C.UTF-8 \
    DATA_DIR=/home/node/.web-agent \
    DEFAULT_CWD=/workspace \
    DISABLE_AUTOUPDATER=1
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8790/api/health || exit 1
# tini reaps the agent processes the app starts and stops.
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server/index.js"]
