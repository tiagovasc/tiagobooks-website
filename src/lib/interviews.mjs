import { plainText } from './post-presentation.mjs';

// Keep the page's Markdown as the only content source. Each level-two heading
// contains a topic, show/host and year, followed by its description and video.
export function parseInterviews(body) {
  const sections = [...body.matchAll(/^##\s+(.+)\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)];
  return sections.map(([, heading, text]) => {
    const video = text.match(/https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/);
    if (!video) throw new Error('Interview is missing a YouTube video: ' + heading);
    const clean = plainText(heading), parts = clean.split(/\s+\|\s+/);
    const year = clean.match(/\((\d{4})\)\s*$/)?.[1] || '';
    const paragraphs = text.trim().split(/\r?\n\s*\r?\n/)
      .filter(p => !/^https?:\/\//.test(p.trim())).map(plainText).filter(Boolean);
    return {
      id: video[1], title: parts[0], host: (parts[1] || '').replace(/\s*\(\d{4}\)\s*$/, ''), year,
      paragraphs, href: `https://www.youtube.com/watch?v=${video[1]}`,
      image: `/uploads/interviews/${video[1]}.webp`,
    };
  });
}
