// Construct a fixed Codex command without embedding the run-scoped bearer in the command line.
import { config } from '../../config.ts';

/** A synchronous hook forwards only its event identity and waits for Hydor's checkpoint attempt. */
export function codexWikiHookCommand(): string {
  const url = `http://127.0.0.1:${config.port}/agent/codex/wiki-event`;
  const script = `let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{if(b.length<1048576)b+=x});process.stdin.on('end',async()=>{try{const v=JSON.parse(b);if(v.trigger!=='auto'||v.hook_event_name!=='PreCompact')return;await fetch(${JSON.stringify(url)},{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.HYDOR_WIKI_HOOK_TOKEN},body:JSON.stringify({session_id:v.session_id,hook_event_name:v.hook_event_name,trigger:v.trigger}),signal:AbortSignal.timeout(18000)})}catch{}});`;
  const encoded = Buffer.from(script).toString('base64');
  // Base64 contains no shell metacharacters; quote the executable for each supported shell.
  const executable = process.platform === 'win32' ? `"${process.execPath.replace(/"/g, '')}"` : `'${process.execPath.replace(/'/g, `'\\''`)}'`;
  return `${executable} -e "eval(Buffer.from('${encoded}','base64').toString())"`;
}
