// Settings in the environment from before the rename to Hydor still apply: each NAGET_X (or NAGET_AGENT_X) is
// copied to HYDOR_X when that one is not set. Imported first by the entry points, before anything reads process.env.
for (const [key, value] of Object.entries(process.env)) {
  const m = /^NAGET_(?:AGENT_)?(.+)$/.exec(key);
  if (m && value !== undefined && process.env[`HYDOR_${m[1]}`] === undefined) process.env[`HYDOR_${m[1]}`] = value;
}

export {};
