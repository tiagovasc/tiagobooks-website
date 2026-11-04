import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { load as yamlLoad } from 'js-yaml';
import rehypeKatex from 'rehype-katex';
import rehypeMedia from './src/lib/rehype-media.mjs';
import rehypeContent from './src/lib/rehype-content.mjs';
import site from './src/lib/site-config.mjs';

// Imported plugin edits must invalidate Astro's cached Markdown output too.
const mediaRevision = createHash('sha256').update(readFileSync(new URL('./src/lib/rehype-media.mjs', import.meta.url))).digest('hex');

// Entries marked protected/unlisted must never appear in the sitemap.
function hiddenPaths() {
  const out = new Set();
  for (const [dir, prefix] of [['src/content/posts', '/posts/'], ['src/content/pages', '/pages/']]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.mdx?$/.test(f)) continue;
      const fm = readFileSync(`${dir}/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      if (/^(protected|unlisted|draft):\s*true\s*$/m.test(fm)) out.add(prefix + f.replace(/\.mdx?$/, ''));
    }
  }
  return out;
}
const hidden = hiddenPaths();

// Pika "aliases" equivalent: frontmatter `aliases: [/old/path, ...]` becomes 301 redirects in dist/_redirects.
function aliasRedirects() {
  return {
    name: 'alias-redirects',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const lines = [];
        for (const [cdir, prefix] of [['src/content/posts', '/posts/'], ['src/content/pages', '/pages/']]) {
          if (!existsSync(cdir)) continue;
          for (const f of readdirSync(cdir)) {
            if (!/\.mdx?$/.test(f)) continue;
            const fm = readFileSync(`${cdir}/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1];
            const aliases = fm ? (yamlLoad(fm)?.aliases ?? []) : [];
            for (const a of aliases) lines.push(`${a.startsWith('/') ? a : '/' + a} ${prefix}${f.replace(/\.mdx?$/, '')} 301`);
          }
        }
        if (!lines.length) return;
        const out = new URL('_redirects', dir);
        const prev = existsSync(out) ? readFileSync(out, 'utf8') : '';
        writeFileSync(out, `${prev.trimEnd()}\n\n# generated from frontmatter aliases\n${lines.join('\n')}\n`);
      },
    },
  };
}

// Mirrors Pika URL scheme: /posts/slug, /pages/slug, /tag/Name, /posts (list), /search
export default defineConfig({
  site: site.url,
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    aliasRedirects(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !hidden.has(path) && !path.endsWith('/404') && !path.endsWith('/editor') && path !== '/posts' && !path.startsWith('/tag/');
      },
    }),
  ],
  markdown: {
    remarkPlugins: [[remarkMath, { singleDollarTextMath: false }]],
    rehypePlugins: [[rehypeMedia, { revision: mediaRevision }], rehypeContent, rehypeKatex, rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'append', properties: { class: 'anchor', 'aria-label': 'Link to this section', 'data-pagefind-ignore': '' }, content: { type: 'text', value: ' #' } }]],
    shikiConfig: { theme: 'one-dark-pro' },
  },
});
