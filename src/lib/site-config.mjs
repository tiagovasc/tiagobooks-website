import settings from '../data/site.json' with { type: 'json' };

export function siteOrigin(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL must be a complete http(s) origin without credentials, a path, query or fragment.');
  }
  return url.origin;
}
export default { ...settings, url: siteOrigin(process.env.SITE_URL || settings.url) };
