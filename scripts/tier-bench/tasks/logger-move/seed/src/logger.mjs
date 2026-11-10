// The logger: one method per level. Every entry goes to the console and to `sink`.
export const sink = [];

function write(level, message, more) {
  console.log(`[${level}]`, message, ...more);
  sink.push({ level, message, more });
}

export const logger = {
  info: (message, ...more) => write('info', message, more),
  warn: (message, ...more) => write('warn', message, more),
  error: (message, ...more) => write('error', message, more),
};
