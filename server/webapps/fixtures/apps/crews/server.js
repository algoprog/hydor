// Start Kestrel Crews:  npm start
// PORT (default 4950), DATA_DIR (default ./data), HOST, APP_URL (the address people use, for invitation links).
import { fileURLToPath } from 'node:url';
import { openDatabase } from './src/db.js';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT || 4950);
const host = process.env.HOST || '0.0.0.0';
const folder = process.env.DATA_DIR || fileURLToPath(new URL('./data', import.meta.url));

const db = openDatabase(folder);
const server = createApp(db).listen(port, host, (error) => {
  if (error) {
    console.error(`Could not start: ${error.message}`);
    process.exit(1);
  }
  console.log(`Kestrel Crews is running at http://localhost:${port}`);
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 3000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
