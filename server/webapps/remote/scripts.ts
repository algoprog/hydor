// The scripts run on the server, one for each thing the engine does there. Each is plain bash for the host's `bash -ec`,
// with nothing secret in its text: a key's value is given on standard input. Layout, in the login user's home, for a
// deployment called <name>:
//
//   ~/hydor-apps/<name>/compose.yaml  Caddyfile      the compose project (the app, Caddy, the backup service)
//                      .env                          what compose fills in (the images, the address…): no secret
//                      app.env  backup.env           the keys (mode 600: only the owner and root read them)
//                      releases/<id>/                the source of the last three launches (the build context)
//                      backup-image/                 the backup service's image: its Dockerfile and program
//                      state/current.json previous.json history.jsonl releases/<id>.compose.yaml <id>.env
//                      backups/                      the backups (<id>.tar.gz and <id>.json)
//                      backup.sh                     the daily backup of an app that has to be stopped for it (run by cron)
//
// Each script starts with a marker line (# hydor:…) that names it.
import { q } from "./ssh.ts";

export const DEPLOYMENT_NAME = /^[a-z0-9]([a-z0-9-]{0,50}[a-z0-9])?$/;
export const ROOT = "hydor-apps";

const head = (what: string, name: string) => `# hydor:${what}
D="$HOME/${ROOT}/${name}"; mkdir -p "$D/releases" "$D/state/releases" "$D/backups"; cd "$D"`;

/** One change of a deployment at a time, on the server too (the daily copy of a stopped app runs there by itself). */
const LOCK = `if command -v flock >/dev/null 2>&1; then exec 9>"$D/.lock"; flock -w 600 9 || { echo "Another change of this app is still going on the server." >&2; exit 75; }; fi`;

/** A command of the backup program, in a container of its own, so that it works whether or not the services run. */
const bk = (args: string, env = "") => `docker compose run --rm --no-deps -T ${env}backup ${args}`;

/** Waits until the app answers its ready address on the project's network; gives up early when it keeps falling over. */
const WAIT_READY = `wait_ready() {
  end=$(( $(date +%s) + $1 ))
  while :; do
    if docker compose exec -T backup hydor-backup probe >/dev/null 2>&1; then return 0; fi
    cid=$(docker compose ps -a -q app 2>/dev/null | head -n 1)
    restarts=$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)
    if [ "$restarts" -ge 3 ]; then echo "gave_up=the app fell over $restarts times"; return 1; fi
    if [ "$(date +%s)" -ge "$end" ]; then echo "gave_up=no answer in $1 seconds"; return 1; fi
    sleep 0.5
  done
}`;

/** Why an app did not come up: its last lines, what it listens on, what asking it said. */
const WHY = `why_not() {
  docker compose logs --no-color --no-log-prefix --tail 20 app 2>&1 | sed 's/^/log: /' || true
  docker compose logs --no-color --no-log-prefix --tail 3 guard 2>/dev/null | sed 's/^/log: /' || true
  cid=$(docker compose ps -q app 2>/dev/null | head -n 1)
  img=$(sed -n 's/^HYDOR_BACKUP_IMAGE=//p' .env)
  if [ -n "$cid" ]; then echo "listening=$(docker run --rm --network "container:$cid" --entrypoint hydor-backup "$img" listening 2>/dev/null | tail -n 1)"; fi
  echo "probe=$(docker compose exec -T backup hydor-backup probe 2>/dev/null | tail -n 1)"
}`;

/**
 * What a launch or a way back made for itself, taken away when it ends, however it ends: the copies of the files in use
 * (two of them hold keys) and the files it prepared and did not use.
 */
export const tidyScript = (name: string): string => `${head("tidy", name)}
rm -f compose.next.yaml Caddyfile.next .env.next app.env.next backup.env.next app.env.tmp backup.env.tmp .env.tmp
rm -f compose.yaml.prev Caddyfile.prev .env.prev app.env.prev backup.env.prev state/switch-id state/switch-mark`;

/** Names of the keys already on the server (names only), and what is live. */
export const stateScript = (name: string): string => `${head("state", name)}
umask 077; touch app.env backup.env; chmod 600 app.env backup.env
cut -d= -f1 app.env | sed 's/^/app_key=/'
cut -d= -f1 backup.env | sed 's/^/backup_key=/'
echo "current=$(cat state/current.json 2>/dev/null | tr -d '\\n' || true)"
echo "previous=$(cat state/previous.json 2>/dev/null | tr -d '\\n' || true)"
echo "backup_at=$(sed -n 's/^HYDOR_BACKUP_AT=//p' .env 2>/dev/null || true)"
echo "keep_days=$(sed -n 's/^HYDOR_BACKUP_KEEP_DAYS=//p' .env 2>/dev/null || true)"
echo "running=$( [ -f compose.yaml ] && docker compose ps --status running --services 2>/dev/null | tr '\\n' ' ' || true)"`;

export const receiveScript = (name: string, id: string): string => `${head("send", name)}
rm -rf "releases/${id}"; mkdir -p "releases/${id}"
tar -xzf - -C "releases/${id}"
test -f "releases/${id}/Dockerfile" && echo received`;

export const buildScript = (name: string, id: string): string => `${head("build", name)}
cd "releases/${id}"
docker build --progress=plain --label hydor.app=${q(name)} --label hydor.launch=${q(id)} -t ${q(`hydor-${name}:${id}`)} . 2>&1`;

/** The backup service's image, made once for each version of the program (which arrives on standard input). */
export const backupImageScript = (name: string, tag: string, dockerfile: string): string => `${head("backup-image", name)}
mkdir -p backup-image
cat > backup-image/hydor-backup.mjs
cat > backup-image/Dockerfile <<'HYDOR_EOF_FILE'
${dockerfile.trimEnd()}
HYDOR_EOF_FILE
docker image inspect ${q(tag)} >/dev/null 2>&1 || docker build --progress=plain -t ${q(tag)} backup-image 2>&1`;

/**
 * Writes the next compose.yaml, Caddyfile, .env and key files beside the ones in use. Keys arrive on standard input as
 * \`app:NAME=line\` and \`backup:NAME=line\` (as compose reads them); a name given again replaces the old line, a name not
 * given is left. Keys to be made are made here, once, from /dev/urandom.
 */
export const configureScript = (name: string, files: { compose: string; caddyfile: string; env: string }, madeUp: string[]): string => `${head("configure", name)}
umask 077
cat > compose.next.yaml <<'HYDOR_EOF_COMPOSE'
${files.compose.trimEnd()}
HYDOR_EOF_COMPOSE
cat > Caddyfile.next <<'HYDOR_EOF_CADDY'
${files.caddyfile.trimEnd()}
HYDOR_EOF_CADDY
cat > .env.next <<'HYDOR_EOF_ENV'
${files.env.trimEnd()}
HYDOR_EOF_ENV
touch app.env backup.env
cp app.env app.env.next; cp backup.env backup.env.next
while IFS= read -r line; do
  [ -n "$line" ] || continue
  file="\${line%%:*}"; kv="\${line#*:}"; key="\${kv%%=*}"
  case "$file" in app|backup) ;; *) continue;; esac
  grep -v "^\${key}=" "$file.env.next" > "$file.env.tmp" || true
  printf '%s\\n' "$kv" >> "$file.env.tmp"
  mv "$file.env.tmp" "$file.env.next"
done
for key in ${madeUp.map((k) => q(k)).join(" ")}; do
  grep -q "^\${key}=" app.env.next || echo "\${key}=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \\n')" >> app.env.next
done
chmod 600 app.env.next backup.env.next
cut -d= -f1 app.env.next | sed 's/^/app_key=/'
cut -d= -f1 backup.env.next | sed 's/^/backup_key=/'`;

/** A backup of the data as the running version left it, while it runs (a SQLite file, copied by SQLite itself). */
export const snapshotScript = (name: string): string => `${head("snapshot", name)}
${LOCK}
${bk("now --label pre-launch")} | tail -n 1 | sed 's/^/snapshot=/'`;

/** For an app with no SQLite file: it is stopped while its folder is copied, and stays stopped for the switch. */
export const snapshotStoppedScript = (name: string): string => `${head("snapshot-stopped", name)}
${LOCK}
docker compose stop app 2>&1
code=0
out=$(${bk("now --label pre-launch", "-e HYDOR_STOPPED=1 ")}) || code=$?
if [ "$code" != 0 ]; then docker compose start app 2>&1; echo "$out"; exit "$code"; fi
echo "$out" | tail -n 1 | sed 's/^/snapshot=/'`;

/** Which user the app's image runs as: its data folder is made that user's. \`image\` is a word of the shell. */
const OWN_DATA = (image: string) => `ids=$(docker run --rm --network none --entrypoint sh ${image} -c 'echo "$(id -u):$(id -g)"' 2>/dev/null || true)
if [ -z "$ids" ]; then u=$(docker image inspect -f '{{.Config.User}}' ${image}); case "$u" in *[!0-9:]*|'') ;; *:*) ids="$u";; *) ids="$u:$u";; esac; if [ -n "$u" ] && [ -z "$ids" ]; then echo "data_owner=unknown"; fi; fi
if [ -n "$ids" ] && [ "$ids" != "0:0" ]; then
  docker compose run --rm --no-deps -T --entrypoint sh backup -c "[ \\"\\$(stat -c %u:%g /data)\\" = '$ids' ] || chown -R '$ids' /data" 2>&1
fi`;

export interface SwitchAsked {
  /** The launch (or way back) that is switching: what it leaves behind is marked as its own. */
  id: string;
  image: string;
  /** A version is running: stop it, and mark its data as it is before the new one touches it. */
  hadPrevious: boolean;
  waitSeconds: number;
  /** For a way back that also puts data back: the backup to restore while the app is stopped. */
  restore?: string;
}

/** The moment the old version stops being served and the new one starts. */
export const switchScript = (name: string, o: SwitchAsked): string => `${head("switch", name)}
${LOCK}
${WAIT_READY}
${WHY}
rm -f state/switch-id state/switch-mark
for f in compose.yaml Caddyfile .env app.env backup.env; do if [ -f "$f" ]; then cp -p "$f" "$f.prev"; else rm -f "$f.prev"; fi; done
printf '%s' ${q(o.id)} > state/switch-id
date +%s.%N > state/switch-start
${
  o.hadPrevious
    ? `docker compose stop app 2>&1
mark=$(${bk("mark")} | tail -n 1) || { echo "mark_failed=1"; docker compose start app 2>&1; exit 3; }
echo "$mark" > state/switch-mark
echo "mark=$mark"`
    : ""
}
${
  o.restore
    ? `res=$(${bk(`restore ${q(o.restore)}`, "-e HYDOR_STOPPED=1 ")} 2>&1) || { echo "restore_failed=$(echo "$res" | tail -n 1)"; docker compose start app 2>&1; exit 4; }
echo "restored=$(echo "$res" | tail -n 1)"`
    : ""
}
changed=0; cmp -s Caddyfile.next Caddyfile 2>/dev/null || changed=1
mv compose.next.yaml compose.yaml; mv .env.next .env; mv app.env.next app.env; mv backup.env.next backup.env
cat Caddyfile.next > Caddyfile; rm -f Caddyfile.next
echo "switched=1"
${OWN_DATA(q(o.image))}
code=0
docker compose up -d --remove-orphans 2>&1 || code=$?
if [ "$code" = 0 ] && [ "$changed" = 1 ]; then docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || docker compose up -d --force-recreate --no-deps caddy 2>&1; fi
if [ "$code" = 0 ]; then wait_ready ${Math.round(o.waitSeconds)} || code=1; fi
date +%s.%N > state/switch-end
echo "switch_seconds=$(awk -v a="$(cat state/switch-start)" -v b="$(cat state/switch-end)" 'BEGIN{printf "%.1f", b-a}')"
if [ "$code" != 0 ]; then why_not; fi
exit $code`;

export interface PutBackAsked {
  /** The switch being undone: nothing is restored from what another one left. */
  id: string;
  hadPrevious: boolean;
  /** How the data is put back if the new version changed it: a SQLite file from the mark, any other folder from a backup. */
  restore: { kind: "mark" } | { kind: "backup"; id: string } | null;
}

/** After a switch that failed: the previous version's files come back, its data if the new one changed it, and it starts. */
export const putBackScript = (name: string, o: PutBackAsked): string => `${head("putback", name)}
${LOCK}
${WAIT_READY}
echo "== what the new version said"
docker compose logs --no-color --no-log-prefix --tail 30 app 2>&1 | sed 's/^/log: /' || true
docker compose stop app 2>&1 || true
ours=0; [ "$(cat state/switch-id 2>/dev/null || true)" = ${q(o.id)} ] && ours=1
${
  o.hadPrevious
    ? `mark=''
if [ "$ours" = 1 ]; then
  for f in compose.yaml .env app.env backup.env; do if [ -f "$f.prev" ]; then cp -p "$f.prev" "$f"; fi; done
  if [ -f Caddyfile.prev ]; then cat Caddyfile.prev > Caddyfile; fi
  mark=$(cat state/switch-mark 2>/dev/null || true)
fi
${
  o.restore
    ? `if [ -n "$mark" ]; then
  now=$(${bk("fingerprint")} | tail -n 1 || echo unknown)
  if [ "$now" = "$mark" ]; then echo "data=unchanged"
  elif res=$(${bk(o.restore.kind === "mark" ? "revert" : `restore ${q(o.restore.id)}`, "-e HYDOR_STOPPED=1 ")} 2>&1); then echo "data_restored=$(echo "$res" | tail -n 1)"
  else echo "restore_failed=$(echo "$res" | tail -n 1)"; fi
fi`
    : ""
}
img=$(sed -n 's/^HYDOR_IMAGE=//p' .env)
${OWN_DATA('"$img"')}
code=0
docker compose up -d --remove-orphans 2>&1 || code=$?
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
if [ "$code" = 0 ]; then wait_ready 90 || code=1; fi
echo "previous_back=$([ "$code" = 0 ] && echo 1 || echo 0)"`
    : `docker compose stop 2>&1 || true
echo "previous_back=0"`
}`;

/** Writes down what is live (and what was live before), keeps what a way back needs, and prunes what is older. */
export const commitScript = (name: string, id: string, current: string, previous: string | null, keepImages: string[]): string => `${head("commit", name)}
${previous === null ? "rm -f state/previous.json" : `cat > state/previous.json <<'HYDOR_EOF_STATE'\n${previous}\nHYDOR_EOF_STATE`}
cat > state/current.json <<'HYDOR_EOF_STATE'
${current}
HYDOR_EOF_STATE
cp -p compose.yaml "state/releases/${id}.compose.yaml"
cp -p .env "state/releases/${id}.env"
cp -p Caddyfile "state/releases/${id}.caddy"
# the three newest source folders, and the images of the live and previous versions and one more
ls -1d releases/* 2>/dev/null | sort -r | tail -n +4 | xargs -r rm -rf
ls -1 state/releases/*.compose.yaml 2>/dev/null | sort -r | tail -n +6 | while read -r f; do rm -f "$f" "\${f%.compose.yaml}.env" "\${f%.compose.yaml}.caddy"; done
docker image ls --filter label=hydor.app=${q(name)} --format '{{.Repository}}:{{.Tag}}' | sort -r | grep -v -F -x ${keepImages.map((i) => `-e ${q(i)}`).join(" ")} | tail -n +2 | xargs -r docker image rm 2>&1 | sed 's/^/pruned: /' || true`;

export const historyAppendScript = (name: string): string => `${head("history-append", name)}
cat >> state/history.jsonl
tail -n 200 state/history.jsonl > state/history.tmp && mv state/history.tmp state/history.jsonl`;

export const historyScript = (name: string): string => `${head("history", name)}
cat state/history.jsonl 2>/dev/null || true`;

export const caRootScript = (name: string): string => `${head("ca", name)}
for i in $(seq 1 60); do
  if docker compose exec -T caddy test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null; then docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt; exit 0; fi
  sleep 1
done
exit 1`;

/** Gets the previous version's files ready as the next ones, for the switch of a way back. */
export const previousFilesScript = (name: string, id: string): string => `${head("previous-files", name)}
test -f "state/releases/${id}.compose.yaml" && test -f "state/releases/${id}.env" && test -f "state/releases/${id}.caddy" || { echo "gone=1"; exit 1; }
umask 077
cp "state/releases/${id}.compose.yaml" compose.next.yaml
cp "state/releases/${id}.env" .env.next
# the backup's time and days are what they are now, not what they were at that launch
for k in HYDOR_BACKUP_AT HYDOR_BACKUP_KEEP_DAYS; do v=$(grep "^$k=" .env || true); if [ -n "$v" ]; then grep -v "^$k=" .env.next > .env.tmp; echo "$v" >> .env.tmp; mv .env.tmp .env.next; fi; done
cp app.env app.env.next; cp backup.env backup.env.next
cp "state/releases/${id}.caddy" Caddyfile.next
echo ready`;

export const fingerprintScript = (name: string): string => `${head("fingerprint", name)}
${bk("fingerprint")} | tail -n 1`;

/** After a way back: what was current becomes previous, so that going back again goes forward. */
export const swapStateScript = (name: string, current: string, previous: string): string => `${head("swap", name)}
cat > state/current.json <<'HYDOR_EOF_STATE'
${current}
HYDOR_EOF_STATE
cat > state/previous.json <<'HYDOR_EOF_STATE'
${previous}
HYDOR_EOF_STATE`;

export const statusScript = (name: string): string => `${head("status", name)}
echo "current=$(cat state/current.json 2>/dev/null | tr -d '\\n')"
echo "last=$(tail -n 1 state/history.jsonl 2>/dev/null)"
echo "services=$(docker compose ps --format '{{.Service}}:{{.State}}' 2>/dev/null | tr '\\n' ' ')"
cid=$(docker compose ps -q app 2>/dev/null | head -n 1)
echo "started=$(docker inspect --format '{{.State.StartedAt}}' "$cid" 2>/dev/null)"
echo "restarts=$(docker inspect --format '{{.RestartCount}}' "$cid" 2>/dev/null)"
echo "disk_kb=$(df -Pk "$D" | awk 'NR==2{print $4}')"
if [ -f compose.yaml ]; then
  echo "data_kb=$(docker compose run --rm --no-deps -T --entrypoint du backup -sk /data 2>/dev/null | cut -f1)"
  echo "backups=$(${bk("list")} 2>/dev/null | tail -n 1)"
fi
echo "backup_at=$(sed -n 's/^HYDOR_BACKUP_AT=//p' .env 2>/dev/null)"
echo "keep_days=$(sed -n 's/^HYDOR_BACKUP_KEEP_DAYS=//p' .env 2>/dev/null)"
echo "cron=$(crontab -l 2>/dev/null | grep -c "# hydor:${name}$" || true)"
echo "stopped_copy=$([ -f backup.sh ] && echo 1 || echo 0)"`;

export const logsScript = (name: string, o: { since?: string; tail: number; service: string }): string => `${head("logs", name)}
test -f compose.yaml || { echo "Nothing is launched there." >&2; exit 1; }
docker compose logs --no-color --no-log-prefix ${o.since ? `--since ${q(o.since)} ` : ""}--tail ${Math.round(o.tail)} ${q(o.service)} 2>&1`;

/** The values held on the server, to be hidden from what is shown. They are read for masking and kept nowhere. */
export const heldScript = (name: string): string => `${head("held", name)}
cat app.env backup.env app.env.next backup.env.next 2>/dev/null || true`;

export const restartScript = (name: string): string => `${head("restart", name)}
${LOCK}
${WAIT_READY}
${WHY}
docker compose restart app 2>&1
docker compose up -d 2>&1
code=0; wait_ready 90 || code=1
if [ "$code" != 0 ]; then why_not; fi
exit $code`;

/** Whether the app has a container at all: one that was taken down is not started by looking after it. */
const WAS_THERE = `was=$(docker compose ps -a -q app 2>/dev/null | head -n 1)`;

export const startAgainScript = (name: string): string => `${head("start-again", name)}
docker compose start app 2>&1`;

/** A command of the backup program. \`stop\`: the app is stopped while it runs and started again whatever happens. */
export const backupScript = (name: string, args: string[], o: { stop?: boolean } = {}): string => {
  const cmd = args.map((a) => q(a)).join(" ");
  return o.stop
    ? `${head("backup-stopped", name)}
${LOCK}
${WAIT_READY}
${WAS_THERE}
if [ -n "$was" ]; then docker compose stop app >/dev/null 2>&1; fi
code=0
out=$(${bk(cmd, "-e HYDOR_STOPPED=1 ")}) || code=$?
if [ -n "$was" ]; then docker compose up -d >/dev/null 2>&1; wait_ready 90 >/dev/null 2>&1 || true; fi
echo "$out"
exit $code`
    : `${head("backup", name)}
${bk(cmd)}`;
};

export const restoreScript = (name: string, id: string): string => `${head("restore", name)}
${LOCK}
${WAIT_READY}
${WHY}
${WAS_THERE}
if [ -n "$was" ]; then docker compose stop app 2>&1; fi
code=0
out=$(${bk(`restore ${q(id)}`, "-e HYDOR_STOPPED=1 ")} 2>&1) || code=$?
echo "$out" | tail -n 1 | sed 's/^/restore=/'
if [ -z "$was" ]; then echo "up=down"; exit $code; fi
docker compose up -d 2>&1
up=0; wait_ready 90 || up=1
echo "up=$([ "$up" = 0 ] && echo 1 || echo 0)"
if [ "$up" != 0 ]; then why_not; fi
exit $code`;

/** The archive's bytes on standard output (the backup service writes them as root, so it reads them). */
export const pullScript = (name: string, id: string): string => `${head("pull", name)}
test -f compose.yaml || exit 1
docker compose run --rm --no-deps -T --entrypoint cat backup ${q(`/backups/${id}.tar.gz`)}`;

/** The new time and days kept: the compose file's .env, and the backup service started with them. */
export const scheduleScript = (name: string, at: string, keepDays: number): string => `${head("schedule", name)}
test -f .env || { echo "launched=0"; exit 1; }
grep -v -E '^HYDOR_BACKUP_(AT|KEEP_DAYS)=' .env > .env.tmp
printf 'HYDOR_BACKUP_AT=%s\\nHYDOR_BACKUP_KEEP_DAYS=%s\\n' ${q(at)} ${Math.round(keepDays)} >> .env.tmp
mv .env.tmp .env
docker compose up -d --no-deps backup 2>&1`;

/**
 * The daily copy of an app that has to be stopped for it, which only the server itself can do: a script of the
 * deployment's, run by the user's crontab. \`at\` is UTC; cron keeps the machine's own time. With a SQLite app
 * (\`null\`) any line from before is taken out.
 */
export const cronScript = (name: string, at: string | null): string => `${head("cron", name)}
line="# hydor:${name}"
if ! command -v crontab >/dev/null 2>&1; then rm -f backup.sh; echo "cron=missing"; exit 0; fi
others=$(crontab -l 2>/dev/null | grep -v "$line\\$" || true)
${
  at === null
    ? `rm -f backup.sh
if crontab -l 2>/dev/null | grep -q "$line\\$"; then printf '%s\\n' "$others" | crontab -; fi
echo "cron=none"`
    : `cat > backup.sh <<'HYDOR_EOF_CRON'
#!/bin/sh
# Written by Hydor: this app names no SQLite database, so it is stopped while its folder is copied.
cd "$(dirname "$0")" || exit 1
exec 9>.lock
flock -w 600 9 || exit 75
docker compose stop app >/dev/null 2>&1
docker compose run --rm --no-deps -T -e HYDOR_STOPPED=1 backup now --label scheduled
code=$?
docker compose start app >/dev/null 2>&1
exit $code
HYDOR_EOF_CRON
chmod 700 backup.sh
when=$(date -d ${q(`${at} UTC`)} '+%M %H')
{ [ -n "$others" ] && printf '%s\\n' "$others"; echo "$when * * * $D/backup.sh >> $D/backup.log 2>&1 $line"; } | crontab -
echo "cron=set"`
}`;

/** Stops and takes away the containers. The data, the certificates, the keys and the backups stay. */
export const takeDownScript = (name: string): string => `${head("takedown", name)}
${LOCK}
test -f compose.yaml || { echo "nothing=1"; exit 0; }
if command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -q "# hydor:${name}\\$"; then others=$(crontab -l | grep -v "# hydor:${name}\\$" || true); printf '%s\\n' "$others" | crontab -; fi
docker compose down --remove-orphans 2>&1`;
