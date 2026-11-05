# syntax=docker/dockerfile:1
# Hydor in one container: the agent harness, Claude Code and Codex. Published for linux/amd64
# and linux/arm64 as algoprog/hydor, so it runs with Docker on Linux, macOS and Windows.
#
#   docker compose up -d            the published image (see compose.yaml and the README)
#   docker compose up -d --build    built here from this folder, with your own user ids
#
# The app is a git checkout with what it takes to build it, so it can update itself in place
# (Settings → General): scripts/serve.sh starts the server again after an update, and the agents
# carry on meanwhile.

ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
ARG CLAUDE_CODE_VERSION=2.1.308
ARG VERSION=dev
LABEL org.opencontainers.image.title="Hydor" \
      org.opencontainers.image.description="A self-hosted agent harness for Claude Code, Codex and any model" \
      org.opencontainers.image.source="https://github.com/algoprog/hydor" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
# The user the agents run as. Set these to your own ids (id -u, id -g) so that files the agents
# write in mounted folders belong to you.
ARG UID=1000
ARG GID=1000

# git, python3, make and g++ build the app (and its native modules) when it updates. poppler-utils
# reads PDFs (pdftotext) and shows their pages to agents (pdftoppm); python3-venv lets the office
# skills install python-docx, openpyxl, python-pptx and reportlab into the data folder on first use.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini git tmux ripgrep ca-certificates curl openssh-client procps less python3 python3-venv make g++ poppler-utils \
 && rm -rf /var/lib/apt/lists/*

# LibreOffice (a few hundred MB more) shows Word, Excel and PowerPoint files as laid-out pages, and lets
# agents look at the documents they make: build with --build-arg OFFICE=true to add it, with fonts
# that stand in for Calibri, Cambria, Arial and Times.
ARG OFFICE=false
RUN if [ "$OFFICE" = true ]; then apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-liberation2 fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
 && rm -rf /var/lib/apt/lists/*; fi

# TeX Live (about 560 MB more) typesets the LaTeX documents in Pages and shows their pages: build with
# --build-arg LATEX=true to add it, with the publishers' classes the IEEE and Springer LNCS paper templates use
# (texlive-publishers). LATEX=full adds TeX Live's extra fonts too (about 1.7 GB more), which the ACM paper's and the
# CV's templates need. Without it, LaTeX documents are still kept and edited, not typeset.
# pdfLaTeX and XeLaTeX only: LuaLaTeX runs only in bubblewrap's sandbox, which Docker does not allow.
ARG LATEX=false
RUN if [ "$LATEX" = true ] || [ "$LATEX" = full ]; then apt-get update \
 && apt-get install -y --no-install-recommends texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended \
      texlive-xetex texlive-publishers latexmk lmodern \
 && if [ "$LATEX" = full ]; then apt-get install -y --no-install-recommends texlive-fonts-extra; fi \
 && rm -rf /var/lib/apt/lists/*; fi

# ffmpeg (about 150 MB more) takes a video's frames in the Library, which its title and description are written
# from, and its still: build with --build-arg FFMPEG=false to leave it out.
ARG FFMPEG=true
RUN if [ "$FFMPEG" = true ]; then apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*; fi

# Chromium for the agents' browser (Settings → Browser), with fonts for most pages and emoji. Build
# with --build-arg BROWSER=false to leave it out (on x86-64 the app can then download Chrome itself).
ARG BROWSER=true
RUN if [ "$BROWSER" = true ]; then apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*; fi

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
# Updates come from the public repository over HTTPS, however this copy was cloned.
RUN (git remote set-url origin https://github.com/algoprog/hydor.git && git config --unset-all core.sshCommand || true) \
 && npm run build

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
