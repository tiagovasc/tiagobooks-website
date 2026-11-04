// Turn a media URL on its own paragraph into a native preview at build time.
// Inline links, code examples, and unknown providers remain ordinary links.
const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const text = value => ({ type: 'text', value });
const ytHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be']);

function seconds(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m && value ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}

export function mediaDescriptor(href) {
  if (typeof href !== 'string' || /[\s<>]/.test(href)) return null;
  const local = href.startsWith('/') && !href.startsWith('//');
  let url;
  try { url = new URL(href, local ? 'https://local.invalid' : undefined); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (ytHosts.has(url.hostname)) {
    const id = url.hostname.endsWith('youtu.be') ? parts[0]
      : parts[0] === 'watch' ? url.searchParams.get('v')
      : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const src = new URL('https://www.youtube-nocookie.com/embed/' + id);
    src.searchParams.set('rel', '0');
    const start = seconds(url.searchParams.get('start') || url.searchParams.get('t') || url.hash.replace(/^#t=/, '') || '');
    if (start > 0) src.searchParams.set('start', String(start));
    return { kind: 'embed', src: src.href, title: 'YouTube video player', label: 'Watch on YouTube' };
  }
  if (url.hostname === 'open.spotify.com') {
    const path = parts[0] === 'embed' ? parts.slice(1) : parts;
    if (path.length !== 2 || !['show', 'episode', 'track', 'album', 'playlist', 'artist'].includes(path[0]) || !/^[a-zA-Z0-9]{22}$/.test(path[1])) return null;
    return { kind: 'embed', src: `https://open.spotify.com/embed/${path.join('/')}`, href: `https://open.spotify.com/${path.join('/')}`,
      title: 'Spotify player', label: 'Listen on Spotify', layout: 'spotify', height: 352,
      allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' };
  }
  if (['podcasts.apple.com', 'embed.podcasts.apple.com'].includes(url.hostname)) {
    if (!/^\/[a-z]{2}\/podcast\/(?:[^/]+\/)?id\d+\/?$/.test(url.pathname)) return null;
    const src = new URL('https://embed.podcasts.apple.com' + url.pathname);
    const episode = url.searchParams.get('i');
    if (episode && !/^\d+$/.test(episode)) return null;
    if (episode) src.searchParams.set('i', episode);
    return { kind: 'embed', src: src.href, href: src.href.replace('embed.podcasts.apple.com', 'podcasts.apple.com'),
      title: 'Apple Podcasts player', label: 'Listen on Apple Podcasts', layout: episode ? 'apple-episode' : 'apple-show', height: episode ? 175 : 450,
      allow: 'autoplay; encrypted-media; fullscreen' };
  }
  const ext = url.pathname.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','webp','gif','avif','svg'].includes(ext)) return { kind: 'image', src: href, label: 'Open image' };
  if (['mp4','webm','ogv'].includes(ext)) return { kind: 'video', src: href, label: 'Open video' };
  if (['mp3','m4a','ogg','wav','flac'].includes(ext)) return { kind: 'audio', src: href, label: 'Open audio' };
  return null;
}

function preview(href, label) {
  const media = mediaDescriptor(href);
  if (!media) return null;
  const meaningfulLabel = label && label !== href ? label : '';
  let player;
  if (media.kind === 'embed') {
    player = el('iframe', { src: media.src, title: meaningfulLabel || media.title, loading: 'lazy',
      width: 640, height: media.height || 360, allow: media.allow || 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
      allowFullScreen: true, referrerPolicy: 'strict-origin-when-cross-origin' });
  } else if (media.kind === 'image') {
    player = el('img', { src: media.src, alt: meaningfulLabel || 'Image preview', loading: 'lazy', decoding: 'async' });
  } else {
    player = el(media.kind, { src: media.src, controls: true, preload: 'metadata' }, [text('Your browser cannot play this media.')]);
  }
  return el('figure', { className: ['media-preview', 'media-' + media.kind, ...(media.layout ? ['media-' + media.layout] : [])] }, [player,
    el('figcaption', {}, [el('a', { href: media.href || href }, [text(media.label)])])]);
}

export default function rehypeMedia() {
  return tree => {
    function walk(node) {
      if (!node.children || ['pre','code','a'].includes(node.tagName)) return;
      node.children = node.children.map(child => {
        if (child.type === 'element' && child.tagName === 'p') {
          const content = child.children.filter(n => n.type !== 'text' || n.value.trim());
          if (content.length === 1) {
            const item = content[0];
            const href = item.type === 'text' ? item.value.trim()
              : item.tagName === 'a' && item.children.every(n => n.type === 'text') ? item.properties.href : null;
            const label = item.type === 'text' ? href : item.children?.map(n => n.value || '').join('');
            const replacement = href && preview(href, label);
            if (replacement) return replacement;
          }
        }
        walk(child); return child;
      });
    }
    walk(tree);
  };
}
