// What admins can do: see the accounts and the totals, change a role, remove an account.
import { removeAllOf } from './files.mjs';
import { revokeAll } from './tokens.mjs';
import { HttpError } from './util.mjs';

export function requireAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'only admins can do that');
}

export function listUsers(store) {
  return store.data.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role ?? 'user', createdAt: u.createdAt }));
}

export function stats(store) {
  return {
    users: store.data.users.length,
    files: store.data.files.length,
    bytes: store.data.files.reduce((sum, f) => sum + f.size, 0),
  };
}

function find(store, id) {
  const user = store.userById(id);
  if (!user) throw new HttpError(404, 'no such account');
  return user;
}

export function setRole(store, id, role) {
  if (role !== 'user' && role !== 'admin') throw new HttpError(400, 'the role is user or admin');
  const user = find(store, id);
  user.role = role;
  store.save();
  return { id: user.id, role: user.role };
}

export function deleteUser(store, admin, id) {
  const user = find(store, id);
  if (user === admin) throw new HttpError(400, 'you cannot remove your own account');
  removeAllOf(store, user);
  revokeAll(store, user.id);
  store.data.users = store.data.users.filter((u) => u !== user);
  store.save();
}
