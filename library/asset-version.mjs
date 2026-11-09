import {createHash} from 'node:crypto';
// The version both the build (in ?v=) and the servers (to grant long caching) derive from file bytes.
export const assetVersion=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
// Year-long caching only for a request whose ?v= names exactly the bytes being served,
// so an old or invented version can never pin different content in a browser cache.
export const versionedCache=(url,bytes)=>{const v=url.searchParams.get('v');return v&&v===assetVersion(bytes)?'public, max-age=31536000, immutable':null};
