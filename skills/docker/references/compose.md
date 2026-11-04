# Compose in more depth

Open this for variables and `.env` files, optional services, several compose files, jobs such as
database migrations, networks, running Compose on a server, CI, watch mode, and Compose surprises.

## Variables and .env files

- Compose fills `${NAME}` in the compose file from the shell's environment first, then from the file
  given with `--env-file`, otherwise from the `.env` beside the compose file. `--env-file` replaces
  `.env`: that file is not read at all then.
- `${DB_PASSWORD:?DB_PASSWORD must be set}` stops Compose with that message when the value is missing
  or empty, instead of starting with a blank password. `${PORT:-8080}` gives a default.
- `$$` is a literal `$`, left for the container's own shell:
  `test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]`.
- `docker compose config --environment` lists the values used (Compose 2.27.2 and later);
  `docker compose config` shows the whole file after them. Both print passwords too: pick out the
  names you need (`| grep '^PORT='`), never paste the whole output.
- `environment:` and `env_file:` set variables inside the container, which is a separate thing from
  filling in the compose file.

## Optional services: profiles

```yaml
services:
  adminer:
    image: adminer
    profiles: [debug]
```

It starts only with `docker compose --profile debug up -d` (or `COMPOSE_PROFILES=debug`). Services
without a profile always start, so the core ones never get one.

## Several compose files

- `compose.override.yaml` is merged by itself when it exists and no `-f` is given
  (`references/examples.md`). Production files are always named: `docker compose -f compose.yaml -f compose.prod.yaml up -d`.
- Later files add to and override earlier ones. Relative paths in every file are read from the first
  file's folder.
- Lists such as `ports` are added together, not replaced: `ports: !reset []` in the later file clears
  them (Compose 2.18 and later), and `!override` replaces a value whole (2.24.4 and later).
- Look at the result before running it: `docker compose -f compose.yaml -f compose.prod.yaml config`.

## Jobs and start order

```yaml
services:
  migrate:
    build: .
    command: ["npm", "run", "migrate"]
    depends_on:
      db:
        condition: service_healthy
    restart: "no"
  web:
    build: .
    depends_on:
      migrate:
        condition: service_completed_successfully   # the job must finish with exit code 0
      db:
        condition: service_healthy
        restart: true    # Compose restarts web when it restarts or updates db (2.17 and later)
  db:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10
```

- `docker compose up -d --wait` returns once the services run and are healthy and the jobs have
  finished, or fails if one does not: good in deploy scripts and CI.
- A one-off command in a fresh container: `docker compose run --rm web npm run seed`.

## Networks

```yaml
services:
  proxy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    networks: [front]
  api:
    build: .
    networks: [front, back]
  db:
    image: postgres:18
    networks: [back]
networks:
  front: {}
  back:
    internal: true    # no route to or from the outside
```

- Only the proxy publishes ports; the database is reachable from `api` alone.
- A network shared by several projects: create it once (`docker network create shared`), then list it
  under `networks:` as `shared: { external: true }`.
- `network_mode: host` turns off service names and published ports; it is rarely what you want. Never
  "fix" a connection by publishing every port or switching to host networking.

## On a server

- **Ports:** `"5432:5432"` opens the database to the internet, and Docker's own firewall rules come
  before ufw's and firewalld's zones, so the host firewall does not stop it. Publish only the proxy,
  bind the rest to the machine itself (`"127.0.0.1:5432:5432"`), or publish nothing.
- **Logs:** the default `json-file` driver keeps every line and can fill the disk. Rotate them per
  service (below), or for every new container with `"log-driver": "local"` in
  `/etc/docker/daemon.json` (it rotates by itself) and a restart of Docker; existing containers keep
  their settings until they are recreated.

```yaml
services:
  web:
    image: myapp:1.4
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

- **Updates:** `docker compose pull && docker compose up -d` recreates only what changed; add
  `--remove-orphans` when services were removed from the file; `docker image prune` clears the old
  images afterwards.
- **Restarts and stopping:** `restart: unless-stopped` for long-running services; `stop_grace_period: 30s`
  for those that need time to finish their work.
- **Hardening:** never mount the Docker socket (`/var/run/docker.sock`) into a container you do not
  fully trust: it gives control of the whole host. No `privileged: true` or `cap_add: [ALL]` without a
  reason; `read_only: true` with `tmpfs: [/tmp]` where the app allows it.
- **Backups:** Compose backs up nothing. Dump databases from their container:
  `docker compose exec -T db pg_dump -U postgres -Fc app > app.dump` (`-T`: no terminal, so piped
  input and output stay clean). Schedules, off-site copies and restore tests: the servers skill.
- The machine around the containers (its firewall, disk, updates, users): the servers skill.

## CI

Give each job a project name of its own, so jobs do not collide and the clean-up touches only that
job: `docker compose -p "ci-$CI_JOB_ID" up -d --wait`, then `docker compose -p "ci-$CI_JOB_ID" down -v`
(here `-v` is right: the volumes are the job's own).

## Watch mode, for development

```yaml
services:
  web:
    build: .
    develop:
      watch:
        - action: sync             # copy changed source into the container
          path: ./src
          target: /app/src
        - action: rebuild          # rebuild the image when dependencies change
          path: package.json
```

`docker compose up --watch` (or `docker compose watch`). `sync+restart` copies and then restarts, for
configuration files. It works only for services built from local source, and the container's user
must be able to write to the target.

## When Compose surprises you

| Symptom | Look at |
| --- | --- |
| A setting seems ignored | `docker compose config`: the merged file with the variables filled in |
| "required variable ... is missing a value" | The shell, the `--env-file` file, or `.env` |
| A service name does not resolve | Both services on a shared network; no `network_mode: host` |
| The host reaches it, another container cannot | Use `service:container_port`, not `localhost` or the published port |
| Unhealthy | `docker inspect --format '{{json .State.Health}}' <name>`; the probe's program exists in the image (slim images often lack `curl`) |
| Data gone | An earlier `down -v` or volume prune; a volume mounted at the wrong path for the image's version |
| Watch does nothing | The service has `build:`; the target is writable for the container's user |
| Works on one machine only | The image's architecture (`--platform`), host paths in bind mounts |
