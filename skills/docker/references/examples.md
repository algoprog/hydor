# Docker examples

Adapt these to the project: versions, ports, build commands and paths are examples.

## Python web app (multi-stage, non-root)

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.13-slim AS build
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM python:3.13-slim
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 app
COPY --from=build /opt/venv /opt/venv
COPY --chown=app:app . .
USER app
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "app:app"]
```

- `PYTHONUNBUFFERED=1` makes logs appear at once in `docker logs`.
- With uv instead of pip: copy `pyproject.toml` and `uv.lock`, then `RUN uv sync --frozen --no-dev`.

## Go service (static binary, tiny final image)

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/app

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/app /app
USER nonroot
ENTRYPOINT ["/app"]
```

Distroless images have no shell: debug with a debug variant of the image, or by running the build stage
(`docker build --target build -t app:build .`).

## A .dockerignore

```text
.git
.gitignore
node_modules
dist
build
coverage
.venv
__pycache__
*.log
.env
.env.*
!.env.example
Dockerfile*
compose*.yaml
docker-compose*.yml
.DS_Store
```

Keep in the build context only what the build needs; check what goes in with a quick
`docker build --no-cache --progress=plain .` and look at the size of "transferring context".

## Development override with live reload

`compose.yaml` holds the production-like setup; `compose.override.yaml` is merged automatically for
local work:

```yaml
services:
  web:
    build:
      target: build
    command: ["npm", "run", "dev"]
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
```

- The anonymous volume `/app/node_modules` keeps the container's installed modules from being hidden by
  the bind mount of the project folder.
- `docker compose -f compose.yaml up` ignores the override (production-like run).
- Compose's `develop.watch` (`docker compose watch`) is an alternative to bind mounts: it syncs or rebuilds
  on file changes.

## Health checks

```dockerfile
# An image with curl:
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1
```

```yaml
# Compose, for common services:
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]            # PostgreSQL
  # test: ["CMD", "redis-cli", "ping"]                      # Redis
  # test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]  # MySQL
  interval: 5s
  timeout: 3s
  retries: 10
  start_period: 10s
```

A health endpoint should check what the app needs to serve (its database connection, for example), be
cheap, and not require authentication from inside the container.

## Secrets

- Run time: `--env-file .env` (kept out of git), or Compose `secrets:` mounted as files under
  `/run/secrets/<name>`; many official images accept `*_FILE` variables that read from such files.
- Build time: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci` with
  `docker build --secret id=npmrc,src=$HOME/.npmrc .`; the secret is not stored in any layer.
- Check an image for leftovers: `docker history --no-trunc <image>` and look at `ENV` and `ARG` values.

## Useful one-liners

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker stats --no-stream                                  # CPU and memory per container
docker inspect --format '{{json .Mounts}}' <name>         # what is mounted where
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <name>
docker network ls && docker network inspect <network>     # who is on which network
docker cp <name>:/app/logs/error.log /tmp/error.log       # copy a file out
docker run --rm -it --network container:<name> nicolaka/netshoot   # network tools beside a container
```
