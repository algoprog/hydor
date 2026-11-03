#!/bin/sh
# The Docker image's server, started again whenever it exits: after the app updates itself (Settings →
# General), or a crash. Agents the server started stay with tini, the container's init, meanwhile,
# and the next server picks them up again: what KillMode=process does for the systemd service.
export HYDOR_RESTARTS=1
trap 'exit 0' TERM INT
while :; do
  node dist/server/index.js &
  wait $!
  sleep 1
done
