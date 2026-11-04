import type { APIRoute } from 'astro';
import site from '../lib/site-config.mjs';

// Pika blocks AI crawlers by default on Pro. Same behaviour here.
const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'Google-Extended', 'Applebot-Extended', 'CCBot', 'PerplexityBot', 'Bytespider', 'Amazonbot',
  'meta-externalagent', 'FacebookBot', 'cohere-ai', 'Diffbot', 'ImagesiftBot', 'Omgilibot',
  'Timpibot', 'YouBot', 'AI2Bot', 'Ai2Bot-Dolma', 'Scrapy', 'DuckAssistBot', 'MistralAI-User',
];

export const GET: APIRoute = () => {
  const body = [
    `Sitemap: ${site.url}/sitemap-index.xml`,
    '',
    ...AI_BOTS.flatMap((b) => [`User-agent: ${b}`, 'Disallow: /', '']),
    'User-agent: *',
    'Allow: /',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=us-ascii' } });
};
