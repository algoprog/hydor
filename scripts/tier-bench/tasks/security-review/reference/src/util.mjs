// Small helpers shared by the modules: errors with a status, reading request bodies, checks and HTML escaping.
import { Buffer } from 'node:buffer';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_JSON = 1024 * 1024;
export const MAX_UPLOAD = 10 * 1024 * 1024;

// Reads a whole request body. A body longer than limit bytes is refused with 413.
export function readBody(req, limit = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      reject(new HttpError(413, 'the body is too large'));
      return;
    }
    const stop = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        stop();
        reject(new HttpError(413, 'the body is too large'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      stop();
      resolve(Buffer.concat(chunks));
    };
    const onError = (err) => {
      stop();
      reject(err);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

// Reads a JSON body that must be an object.
export async function readJson(req) {
  const raw = await readBody(req, MAX_JSON);
  let value;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'the body must be JSON');
  }
  if (!isObject(value)) throw new HttpError(400, 'the body must be a JSON object');
  return value;
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Keys that reach the prototype of an object instead of being data. They are never merged.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Merges src into target: objects are merged key by key, any other value replaces the old one. Only the target's own
// keys are looked at, so what an object inherits can never be written to.
export function deepMerge(target, src) {
  for (const key of Object.keys(src)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const value = src[key];
    const current = Object.hasOwn(target, key) ? target[key] : undefined;
    if (isObject(value) && isObject(current)) {
      deepMerge(current, value);
    } else if (isObject(value)) {
      target[key] = deepMerge({}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const LOCAL = /^[a-zA-Z0-9._-]+$/;
const LABEL = /^[a-zA-Z0-9-]+$/;

// name@host.domain: letters, digits, dots, hyphens and underscores before the @, a host with at least one dot after it.
// Each part is checked on its own with patterns that cannot backtrack, and the whole is at most 254 characters.
export function isEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const labels = value.slice(at + 1).split('.');
  if (labels.length < 2 || !LOCAL.test(value.slice(0, at))) return false;
  const tld = labels[labels.length - 1];
  return labels.every((label) => LABEL.test(label)) && tld.length >= 2 && /^[a-zA-Z]+$/.test(tld);
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
