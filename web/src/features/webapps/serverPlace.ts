// Which place of an app a launch to a server is for: the one that server holds already; else production, while no server
// holds it; else a second place named after the server (with keys and a history of its own).

/** Names that are Hydor's own, never a server place's. */
const OWN = ['hydor', 'hydor-preview', 'all'];

export function envFor(deployments: readonly { env: string; host: string }[], host: string): string {
  const there = deployments.find((d) => d.host === host);
  if (there) return there.env;
  if (!deployments.some((d) => d.env === 'production')) return 'production';
  const name = OWN.includes(host) ? `server-${host}` : host.slice(0, 30).replace(/-+$/, '');
  return name === 'production' ? 'production-2' : name;
}
