// Podcast episodes for the Podcast page, built from posts tagged "Podcast" (4 Nov 2026).
// Each episode links to its blog post; Spotify and Apple Podcasts use per-post frontmatter
// (`spotify:`, `apple:`) when present and otherwise the show pages.
import { getListedPosts, longDate, type Post } from './content';

export const SHOW = {
  spotify: 'https://open.spotify.com/show/4ifa95kknLrUQblYTUMQ7T',
  apple: 'https://podcasts.apple.com/us/podcast/anagoge-podcast/id1512482918',
  youtube: 'https://www.youtube.com/@AnagogePodcast',
};

export interface Episode {
  id: string; href: string; topic: string; guest: string; date: string; iso: string;
  teaser: string; youtubeId: string | null; image: string | null;
  crop: { x: number; y: number; zoom: number };
  spotify: string; apple: string; youtube: string;
}

// Markdown sources sometimes carry HTML entities (&nbsp; between sentences); decode them so they never show as text.
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);
const plain = (md: string) => decode(md)
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// The opening paragraphs of the post, cut to 40 to 60 words at a sentence end where possible.
export function teaserFrom(body: string, min = 40, max = 60): string {
  const paras: string[] = [];
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const p = block.trim();
    if (!p) continue;
    if (p.startsWith('#')) { if (paras.length) break; continue; }
    if (/^(https?:|<|[-*+] |!|\||\d{1,2}:\d{2})/.test(p) || /^\**abstract\**$/i.test(p)) continue;
    paras.push(plain(p));
    if (paras.join(' ').split(' ').length > 120) break;
  }
  const text = paras.join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const s of sentences) {
    if ([...out, s].join(' ').split(' ').length > max) break;
    out.push(s);
  }
  const fitted = out.join(' ');
  if (fitted.split(' ').length >= min) return fitted;
  return text.split(' ').slice(0, max - 2).join(' ').replace(/[,;:]$/, '') + '…';
}

function split(title: string) {
  const clean = title.trim().replace(/^Podcast:\s*/i, '').replace(/\s*\(Anagoge Podcast\)\s*$/i, '');
  const m = clean.match(/^(.*\S)\s+with\s+(.+)$/);
  return m ? { topic: m[1], guest: m[2] } : { topic: clean, guest: '' };
}

export function toEpisode(p: Post): Episode {
  const body = p.body ?? '';
  const d = p.data as Post['data'] & { spotify?: string; apple?: string; youtube?: string };
  const yt = body.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
  const image = d.image ?? body.match(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/)?.[1] ?? null;
  const { topic, guest } = split(d.title);
  return {
    id: p.id, href: `/posts/${p.id}`, topic, guest, date: longDate(d.date), iso: d.date.toISOString(),
    teaser: teaserFrom(body),
    youtubeId: yt, image,
    crop: d.thumbnailCrop ?? { x: 50, y: 50, zoom: 1 },
    spotify: d.spotify || SHOW.spotify, apple: d.apple || SHOW.apple,
    youtube: d.youtube || (yt ? `https://www.youtube.com/watch?v=${yt}` : SHOW.youtube),
  };
}

export async function getEpisodes(): Promise<Episode[]> {
  return (await getListedPosts()).filter((p) => p.data.tags.includes('Podcast')).map(toEpisode);
}
