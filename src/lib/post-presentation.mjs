import { parseFragment } from 'parse5';

export const BLOG_SECTIONS = ['General', 'Podcast', 'Book Reviews', 'In Search of the Infinite'];
export const visibleTags = tags => BLOG_SECTIONS.filter(tag => tags.includes(tag));
export const displayTitle = title => title.trim().replace(/^Podcast:\s*/i, '');

export function plainText(value) {
  const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
  return text(parseFragment(value.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, ''))).replace(/\s+/g, ' ').trim();
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
