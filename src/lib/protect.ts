import { webcrypto } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import rehypeMedia from './rehype-media.mjs';
import rehypeContent from './rehype-content.mjs';

const ITERATIONS = 210_000;
const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64');

export function sitePassword(): string {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) {
    throw new Error('SITE_PASSWORD is required to build protected content.');
  }
  return pw;
}

export async function markdownToHtml(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkRehype)
    .use(rehypeMedia)
    .use(rehypeContent)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

/** AES-256-GCM, key from PBKDF2-SHA256. Decrypted in the browser by /js/unlock.js. */
export async function encryptHtml(html: string, password: string) {
  const subtle = webcrypto.subtle;
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html));
  return { salt: b64(salt), iv: b64(iv), data: b64(data), iterations: ITERATIONS };
}
