import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getListedPosts } from '../lib/content';
import { displayTitle } from '../lib/post-presentation.mjs';
import site from '../lib/site-config.mjs';
import { rewriteHtml } from '../lib/html-links.mjs';
import Artwork from '../layouts/Artwork.astro';

// Atom feed at the same URL Pika uses (/posts_feed) so existing subscribers keep working.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const posts = (await getListedPosts()).slice(0, 50);
  const container = await AstroContainer.create();
  const entries: string[] = [];
  for (const p of posts) {
    const { Content } = await render(p);
    const artwork = p.data.image && p.data.artwork
      ? await container.renderToString(Artwork, {props:{image:new URL(p.data.image,site.url).toString(),artwork:p.data.artwork}}) : '';
    const html = rewriteHtml(artwork + await container.renderToString(Content), {fragment:true,basePath:`/posts/${p.id}`});
    const url = p.data.externalUrl || `${site.url}/posts/${p.id}`;
    entries.push(`  <entry>
    <id>tag:tiagovf.com,2005:Post/${p.id}</id>
    <published>${p.data.date.toISOString()}</published>
    <updated>${(p.data.updated ?? p.data.date).toISOString()}</updated>
    <link rel="alternate" type="text/html" href="${esc(url)}"/>
    <title>${esc(displayTitle(p.data.title))}</title>
    <content type="html">${esc(html)}</content>
  </entry>`);
  }
  const updated = (posts[0]?.data.updated ?? posts[0]?.data.date ?? new Date()).toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="${site.language}" xml:base="${esc(site.url)}/" xmlns="http://www.w3.org/2005/Atom">
  <id>tag:tiagovf.com,2005:/posts_feed</id>
  <link rel="alternate" type="text/html" href="${site.url}"/>
  <link rel="self" type="application/atom+xml" href="${site.url}/posts_feed"/>
  <title>${esc(site.title)}</title>
  <author><name>${esc(site.author)}</name></author>
  <updated>${updated}</updated>
${entries.join('\n')}
</feed>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
};
