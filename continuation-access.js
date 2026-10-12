import { normalizeAnswer } from './expedition/game-core.js';

export const ACCESS_KEY = 'defi-esquie:dernier-defi:session-v1';

export async function hashPhrase(phrase) {
  const data = new TextEncoder().encode(normalizeAnswer(phrase));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function phraseMatches(phrase, expectedHash) {
  if (!normalizeAnswer(phrase) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return await hashPhrase(phrase) === expectedHash;
}

export function hasAccess(storage, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  try { return storage.getItem(ACCESS_KEY) === expectedHash; }
  catch { return false; }
}

export function grantAccess(storage, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  try { storage.setItem(ACCESS_KEY, expectedHash); return true; }
  catch { return false; }
}
