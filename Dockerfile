# syntax=docker/dockerfile:1
# Naget Agent in one container: the agent harness, Claude Code and Codex.
#
#   docker compose up -d        (see compose.yaml and the README)
#
# The app is a git checkout with what it takes to build it, so it can update itself in place
# (Settings → General): scripts/serve.sh starts the server again after an update, and the agents
# carry on meanwhile.

ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
ARG CLAUDE_CODE_VERSION=2.1.308
# The user the agents run as. Set these to your own ids (id -u, id -g) so that files the agents
# write in mounted folders belong to you.
ARG UID=1000
ARG GID=1000

# git, python3, make and g++ build the app (and its native modules) when it updates.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini git tmux ripgrep ca-certificates curl openssh-client procps less python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Claude Code; Codex comes with the app's own npm dependencies.
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
 && npm cache clean --force

# The image's `node` user, with your ids.
RUN groupmod -o -g ${GID} node \
 && usermod -o -u ${UID} -g ${GID} node \
 && mkdir -p /workspace /app \
 && chown node:node /workspace /home/node /app

WORKDIR /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node . .
RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8790 \
    HOME=/home/node \
    LANG=C.UTF-8 \
    DEFAULT_CWD=/workspace \
    DISABLE_AUTOUPDATER=1
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8790/api/health || exit 1
# tini reaps the agent processes the app starts and stops, and keeps them across the server's restarts.
ENTRYPOINT ["tini", "-g", "--"]
CMD ["scripts/serve.sh"]
