// For whoever looks after the app, when someone forgets their password:
//   node reset-password.js their@email.com "a new password"
// Use the same DATA_DIR as the running app. It also signs that person out everywhere.
import { randomBytes, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './src/db.js';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8 || password.length > 200) {
  console.error('Usage: node reset-password.js their@email.com "a new password of at least 8 characters"');
  process.exit(1);
}
const db = openDatabase(process.env.DATA_DIR || fileURLToPath(new URL('./data', import.meta.url)));
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
if (!user) {
  console.error('There is no account with that email.');
  process.exit(1);
}
const salt = randomBytes(16);
db.prepare('UPDATE users SET password = ? WHERE id = ?')
  .run(`${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`, user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
db.close();
console.log('Password changed. They can sign in with the new one now.');
