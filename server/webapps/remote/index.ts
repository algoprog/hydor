// Launching an app described by hydor.json to a server of the person's own, and running it there. This is the engine's
// whole surface: everything else in this folder is behind it.
//
// Hosts (kept in a folder the caller gives, never ~/.ssh): addHost makes a key, offerHost shows the machine's
// fingerprints, acceptHost records one, checkHost says what is there (and with `prepare` installs it), removeHost.
// Before a launch: keyStates (what each key needs), dockerfileFor (what it would be built with), parseAddress.
// Launching: launch (the steps of LAUNCH_STEPS, each reported), rollback, history, takeDown.
// Running: status, logs, restart, backups.{list,now,verify,restore,schedule,pull}.
//
// Refusals are thrown as `Refused` (a sentence and a kind); a launch that fails returns its outcome instead.
export { acceptHost, addHost, checkHost, getHost, listHosts, makePendingKey, offerHost, parseSsh, removeHost, HOST_NAME, WHERE_TO_COMPARE, type HostCheck, type HostInfo, type HostOffer, type Scan, type SshTarget } from "./hosts.ts";
export type { Finding } from "./host-check.ts";
export { keyStates, mask, STORAGE_KEYS, type KeyState } from "./keys.ts";
export { dockerfileFor, APP_PORT, DATA_PATH, type DockerfileChoice, type DockerfileKind } from "./dockerfile.ts";
export { isLocalName } from "./compose.ts";
export { sourceFiles } from "./source.ts";
export { checkName, launch, rollback, parseAddress, parseState, checkSchedule, MUST_PASS, type LaunchOptions, type RollbackOptions, type Place, type SmokeRunner, type Live } from "./launch.ts";
export { backups, history, logs, restart, status, takeDown, countLog, NOT_STRUCTURED, type LogsOptions } from "./run.ts";
export { connectSsh, SshRefused, type Connect, type HostConnection, type Remote, type RunResult } from "./ssh.ts";
export type { Probes, Target as ProbeTarget } from "./probe.ts";
export { LAUNCH_STEPS, Refused, type CheckLine, type CheckOutcome, type LaunchOutcome, type RefusalKind, type RemoteBackup, type RemoteContract, type RemoteRecord, type RemoteStatus, type Step, type StepId, type StepState } from "./types.ts";
