import { getCollection, type CollectionEntry } from 'astro:content';
import site from './site-config.mjs';

export type Post = CollectionEntry<'posts'>;
export type Page = CollectionEntry<'pages'>;

const isProd = import.meta.env.PROD;

/** All publishable posts (drafts hidden in production), newest first. */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (p) => !(isProd && p.data.draft));
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Posts shown in lists, feed, sitemap and search. */
export async function getListedPosts(): Promise<Post[]> {
  return (await getAllPosts()).filter((p) => !p.data.unlisted && !p.data.protected);
}

export async function getAllPages(): Promise<Page[]> {
  return getCollection('pages', (p) => !(isProd && p.data.draft));
}

export function tagSlug(tag: string): string {
  return tag.trim().replace(/\s+/g, '-');
}

export async function getTagMap(): Promise<Map<string, { label: string; posts: Post[] }>> {
  const map = new Map<string, { label: string; posts: Post[] }>();
  for (const post of await getListedPosts()) {
    for (const t of post.data.tags) {
      const key = tagSlug(t);
      if (!map.has(key)) map.set(key, { label: t, posts: [] });
      map.get(key)!.posts.push(post);
    }
  }
  return map;
}

const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, ...opts }).format(d);

/** "Oct 9" as shown in the post list. */
export const shortDate = (d: Date) => fmt({ month: 'short', day: 'numeric' }, d);
/** "May 23, 2026" as shown on a post. */
export const longDate = (d: Date) => fmt({ month: 'long', day: 'numeric', year: 'numeric' }, d);
export const yearOf = (d: Date) => Number(fmt({ year: 'numeric' }, d));
export const monthOf = (d: Date) => `${yearOf(d)}-${fmt({month:'2-digit'},d)}`;
export const monthLabel = (d: Date) => fmt({month:'long',year:'numeric'},d);

export function groupByYear(posts: Post[]): { year: number; posts: Post[] }[] {
  const out: { year: number; posts: Post[] }[] = [];
  for (const p of posts) {
    const y = yearOf(p.data.date);
    const last = out[out.length - 1];
    if (last && last.year === y) last.posts.push(p);
    else out.push({ year: y, posts: [p] });
  }
  return out;
}

export const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
