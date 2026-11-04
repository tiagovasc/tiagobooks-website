import { readFileSync } from 'node:fs';
import policy from '../data/link-policy.json' with { type: 'json' };
import site from './site-config.mjs';

export const internalOrigins = [...new Set([...policy.internalOrigins, site.url])];
const origins = new Set(internalOrigins.flatMap(value => {
  const u = new URL(value);
  return u.port ? [u.origin] : ['https://' + u.hostname, 'http://' + u.hostname];
}));
export const unavailablePaths = policy.unavailablePaths;
export function readRedirects(file = 'public/_redirects') {
  return new Map(readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => line.startsWith('/')).map(line => line.trim().split(/\s+/).slice(0, 2)));
}
const redirects = readRedirects();

export function normalizeSiteLink(value, { basePath = '/', redirectMap = redirects } = {}) {
  if (typeof value !== 'string' || !value || value.startsWith('#') || /^(mailto|tel|data|javascript):/i.test(value)) return value;
  let url;
  try { url = new URL(value, new URL(basePath, site.url)); } catch { return value; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !origins.has(url.origin)) return value;
  let path = redirectMap.get(url.pathname) || url.pathname;
  if (path === '/index.html') path = '/';
  if (/^\/(posts|pages|tag)\/.+\.html$/.test(path)) path = path.slice(0, -5);
  if (path.length > 1 && path.endsWith('/') && !path.startsWith('/admin')) path = path.slice(0, -1);
  const visited = new Set();
  while (redirectMap.has(path)) {
    if (visited.has(path)) throw new Error(`Redirect cycle at ${path}`);
    visited.add(path); path = redirectMap.get(path);
  }
  return path + url.search + url.hash;
}

export function unavailableReason(value) {
  const normalized = normalizeSiteLink(value);
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return undefined;
  try { return unavailablePaths[new URL(normalized, site.url).pathname]; } catch { return undefined; }
}

export function absoluteSiteLink(value, options) {
  const normalized = normalizeSiteLink(value, options);
  return normalized.startsWith('/') && !normalized.startsWith('//') ? new URL(normalized, site.url).href : normalized;
}
