---
name: docker
description: Use when writing or fixing a Dockerfile or a compose file, building, running or debugging containers, or cleaning up images, containers and volumes.
category: coding
triggers: [dockerfile, docker compose, docker-compose, docker build, docker run, docker image*, docker container*, containeri*, docker volume*, docker network*, docker logs, exited with code]
---

# Docker

A container packages an app with what it needs, so it runs the same anywhere. Good images are small,
rebuild fast because their layers are ordered for the cache, run as a non-root user, and carry no
secrets. Good debugging starts from the exit code, the logs and a shell inside the container.

## 1. Before you start

- `docker version` and `docker compose version` (Compose v2 and later is `docker compose`, with a space).
- Read what is there: the Dockerfile, the compose file, `.dockerignore`, and `.env` (its names, not its
  values: do not print secrets into the conversation).
- Containers and volumes can hold the user's data: ask before removing or recreating what you did not make.
- On a server, the machine around the containers (its firewall, disk, updates, backups) is the servers
  skill's work.

## 2. Write a good Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
```

- Pin the base image (`node:22-slim`, `python:3.13-slim`), not `latest`. Alpine is smaller but uses musl:
  native modules and some Python wheels break or build slowly there.
- Order for the cache: copy the dependency manifests and install first, then copy the source, so an edit
  reuses the install layer.
- Multi-stage: compilers and dev dependencies stay in the build stage; the final stage gets only what runs.
- A `.dockerignore` (`.git`, `node_modules`, build output, `.env*`, logs, test data): faster builds, and
  no secrets or junk copied in.
- Run as a non-root user (`USER node`, or `RUN useradd --create-home --uid 10001 app` then `USER app`).
- Exec form for `CMD` and `ENTRYPOINT` (`["node", "server.js"]`), so the app receives stop signals; add
  `--init` (or tini) for processes that spawn children.
- One process per container, logging to stdout and stderr, not to files.
- No secrets in the image: not in `ENV`, `ARG` or copied files, since they stay in the layers and
  `docker history`. Pass them at run time, or at build time with
  `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci` and `docker build --secret id=npmrc,src=.npmrc`.
- `apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*` in one
  `RUN`.

More examples (Python, Go, a full `.dockerignore`, a development override) in `references/examples.md`.

## 3. Build and run

```bash
docker build -t myapp:dev .
docker run --rm -it -p 3000:3000 --env-file .env myapp:dev
docker image ls myapp          # size
docker history myapp:dev       # which layers are big
```

- `-p host:container`. Inside the container the app must listen on `0.0.0.0`, not `127.0.0.1`, or the
  published port reaches nothing.
- Building on an ARM Mac for an x86 server: `docker build --platform linux/amd64 ...`.

## 4. Compose for several services

```yaml
services:
  web:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
  db:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes: ["pgdata:/var/lib/postgresql"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
secrets:
  db_password:
    file: ./db_password.txt
```

- Services reach each other by service name (`db:5432`). Inside a container, `localhost` is that
  container itself.
- `depends_on` with `condition: service_healthy` waits for the health check; without it, only the start
  order is set. A job that must finish first (a migration): `condition: service_completed_successfully`.
  `docker compose up -d --wait` returns once services are healthy and such jobs are done.
- `${DB_PASSWORD:?DB_PASSWORD must be set}` stops Compose when a value is missing, instead of starting
  with a blank one; `$$` passes a `$` through to the container's shell.
- On a server, `ports:` opens a port to the internet whatever ufw or firewalld say: publish only what
  must be public, bind the rest to the machine (`"127.0.0.1:5432:5432"`), and rotate the logs, which
  are otherwise kept forever.
- Image data paths change between versions: `postgres:18` keeps its data under `/var/lib/postgresql`,
  17 and earlier under `/var/lib/postgresql/data`. Check the image's documentation when you change versions.
- Commands: `docker compose up -d --build`, `docker compose ps`, `docker compose logs -f --tail=100 web`,
  `docker compose exec web sh`, `docker compose run --rm web npm test`, and `docker compose config`
  (the merged, resolved file: the first thing to look at when a setting seems ignored).
- `docker compose down` removes the containers and network and keeps volumes. `docker compose down -v`
  also deletes the named volumes, the database with them: ask first.
- The top-level `version:` key is obsolete; Compose ignores it.
- Variables and `.env` files, profiles, several compose files, networks, running on a server, CI and
  watch mode: `references/compose.md`.

## 5. Debug a container

1. **State and exit code:** `docker ps -a`, then
   `docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Error}}' <name>`.
2. **Logs:** `docker logs --tail 200 -t <name>` (`-f` to follow, `--since 10m`). The first error usually
   matters more than the last.
3. **A shell inside:** `docker exec -it <name> sh` (bash may not exist). If it crashes at once, start the
   image with a shell instead of its command: `docker run --rm -it --entrypoint sh myapp:dev`.
4. **What the app sees:** `env`, `id` (user), `ls -la` (files and owners), `cat /etc/hosts`, and whether
   other services answer, using the app's own client or `nc -zv db 5432` where it exists.
5. **Health:** `docker inspect --format '{{json .State.Health}}' <name>`.

| Symptom | Usual cause |
| --- | --- |
| Exit code 137 | Killed: out of memory (`OOMKilled` true), or not stopping within the stop timeout |
| Exit code 139 | Segfault, often a native module built for another libc or CPU |
| Exits at once with 0 | The command finished: it was not a long-running server, or it went to the background |
| `exec format error` | Image built for another CPU architecture, or a script without a shebang or with Windows line endings |
| `port is already allocated` | Something on the host uses the port (`ss -ltnp`); pick another host port |
| Connection refused between services | `localhost` instead of the service name, the app bound to 127.0.0.1, or the other service not ready yet |
| `permission denied` on a bind mount | The container's user id differs from the files' owner on the host |
| `no space left on device` | Images, build cache and volumes: `docker system df` |
| Changes do not show | An old image: rebuild (`up --build`); code copied at build time, not mounted |
| Cannot reach the host | Use `host.docker.internal`; on Linux add `--add-host=host.docker.internal:host-gateway` |

## 6. Clean up carefully

- See what uses space: `docker system df` (`-v` for detail).
- Remove what you made, by name: `docker rm <container>`, `docker rmi <image>`, `docker volume rm <volume>`.
- Prune commands are broad; they reach other projects' containers and images too:
  - `docker container prune`: stopped containers. `docker image prune`: dangling images; with `-a`, every
    image no container uses. `docker builder prune`: the build cache (safe; it rebuilds).
  - `docker volume prune`: unused anonymous volumes; with `-a`, unused named volumes too, which is data.
    Never without the user's yes.
  - `docker system prune`: stopped containers, unused networks, dangling images and build cache; `-a` and
    `--volumes` widen it. Not as a casual tidy-up on someone's machine.
- `-f` on any of them means it does not ask first.

## Pitfalls

- `localhost` inside a container meaning the container, not the host or another service.
- Secrets baked into images through `ENV`, `ARG` or `COPY`.
- `COPY . .` before installing dependencies, so every edit reinstalls everything.
- `latest` tags that change under you.
- `docker compose down -v` or a volume prune deleting a database.
- Shell-form `CMD`: the app never sees the stop signal and is killed after the timeout.
- A database published as `"5432:5432"` on a server: open to the internet, whatever the firewall says.
