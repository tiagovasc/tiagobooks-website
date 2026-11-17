import { parseFragment } from 'parse5';

export const BLOG_SECTIONS = ['General', 'Podcast', 'Book Reviews', 'In Search of the Infinite'];
// Reversible presentation preference: true restores both Podcast cards and its Blog filter.
export const BLOG_VISIBILITY = { showPodcastPosts: false };
export const isBlogPostVisible = (post, showPodcastPosts = BLOG_VISIBILITY.showPodcastPosts) =>
  showPodcastPosts || !(post.data.tags || []).some(tag => tag.toLowerCase() === 'podcast');
export const blogMenuSections = (showPodcastPosts = BLOG_VISIBILITY.showPodcastPosts) =>
  BLOG_SECTIONS.filter(tag => showPodcastPosts || tag !== 'Podcast');
export const visibleTags = tags => BLOG_SECTIONS.filter(tag => tags.includes(tag));
export const displayTitle = title => title.trim().replace(/^Podcast:\s*/i, '').replace(/^In Search of the Infinite\s+-\s+/, 'In Search of the Infinite: ');

export function readingMinutes(body='') {
  const text=plainText(body.replace(/```[\s\S]*?```/g,' ').replace(/<[^>]*>/g,' ')
    .replace(/^\s*https?:\/\/\S+\s*$/gm,' ').replace(/\$\$[\s\S]*?\$\$/g,' ')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm,''));
  return Math.max(1,Math.round(text.split(/\s+/).filter(Boolean).length/230));
}

export function plainText(value) {
  const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
  return text(parseFragment(value.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, ''))).replace(/\s+/g, ' ').trim();
}

// Link previews and search snippets: the post's own description or subtitle, else its opening
// sentences (about 160 characters). Protected posts reveal nothing and keep the site description.
export function postSummary(post) {
  const data = post.data || {};
  if (data.protected) return '';
  const own = data.description || data.subtitle || postSubtitle(post);
  if (own) return plainText(String(own));
  const paragraph = (post.body || '').replace(/```[\s\S]*?```/g, ' ').replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .split(/\r?\n\s*\r?\n/).map(part => part.trim())
    .filter(part => part && !/^(#{1,6}\s|>|!\[|<|https?:\/\/\S+$|[-*+]\s|\d+\.\s|\|)/.test(part))
    .map(part => plainText(part)).find(part => part.length > 60) || '';
  if (paragraph.length <= 160) return paragraph;
  return paragraph.slice(0, 158).replace(/\s+\S*$/, '').replace(/[,;:\u2013\u2014-]+$/, '') + '\u2026';
}

// Imported subtitles live in the opening heading or emphasized line. Never mine
// later section headings, provenance notes or podcast abstracts for a subtitle.
export function postSubtitle(post) {
  if (post.data.subtitle) return plainText(post.data.subtitle);
  if (post.data.protected) return '';
  const first = (post.body || '').trim().split(/\r?\n\s*\r?\n/)[0] || '';
  const heading = first.match(/^#{1,6}\s+([^\r\n]+?)(?:\s+#+)?$/);
  const emphasized = /^(?:\*\*|__|\*|_).+(?:\*\*|__|\*|_)$/.test(first) && !first.includes('\n');
  if (!heading && !emphasized) return '';
  const candidate = plainText(heading ? heading[1] : first);
  if (!candidate || candidate.length > 250 || candidate.split(' ').length > 45) return '';
  if (/^(?:abstract|introduction|overview|top takeaways|timestamps|transcript|contents|table of contents|trigger warning|this (?:post|essay|article|chapter)|based on|read the)\b/i.test(candidate)) return '';
  return candidate.toLowerCase() === displayTitle(post.data.title).toLowerCase() ? '' : candidate;
}
