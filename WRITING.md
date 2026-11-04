# Writing and publishing

Published posts live in `src/content/posts/`, pages in `src/content/pages/`, and uploaded media in `public/uploads/`. Preserve filenames to keep existing URLs working.

## Public repository boundary

Everything committed here is public, including earlier revisions. Keep unfinished private work outside this repository. `draft`, `unlisted` and `protected` are rendering features, not GitHub privacy controls. The public-source check rejects entries with these flags enabled; use a separate private source repository if you need that workflow. Do not enter private text into this site's remote CMS.

## Browser editor

Open [the editor](https://tiagobooks.com/admin/). Only a GitHub account with write access can publish. Use token sign-in with a fine-grained token restricted to this repository and Contents read/write. Enter the token only in the editor; never save it in source or a post. OAuth sign-in requires a separately configured provider.

The editor writes to `tiagovasc/tiagobooks-website`, branch `codex/unified-site`. Saving publishes source to GitHub and triggers the connected host's build. Verify that deployment succeeds before checking the live page. Library sign-in and GitHub CMS sign-in are separate.

1. Choose Posts or Pages and create an entry.
2. Add the title, date (for posts), tags, optional description and body.
3. Add images using the media picker and meaningful alternative text.
4. Save only content ready to be public. Review the deployment result.
5. Preserve the slug when editing; add an alias when changing an existing URL.

Navigation is editable in Settings. A future date does not schedule publication. For local editing, follow the README and use `/editor`; commits and pushes remain separate steps.

## Links, images and mathematics

Use `/posts/post-slug`, `/pages/books` and `#heading` for internal links. Broken internal destinations fail the build. See [LINKS.md](LINKS.md) for redirects and domain changes.

Images are centered and can be enlarged with a click or Enter; Escape closes the viewer. Ordinary single dollar signs remain text. Use `$$E=mc^2$$` for inline math, or place `$$` on separate lines around a display equation.

## Automatic media previews

YouTube, Apple Podcasts and Spotify links placed alone in a paragraph become players. Direct image, MP4/WebM video and MP3/M4A/OGG/WAV/FLAC audio links render suitable media. Inline links remain links; feeds retain source links. These transformations run during the build, so the CMS preview may differ from the published result.

The full-content Atom feed is available at `/posts_feed`, with `/feed`, `/rss`, `/rss.xml` and `/atom.xml` aliases.

## Featured paintings

The optional `image` field supplies the blog card and social preview. Adding `artwork` metadata also displays the painting and its credit above the article and in the feed. Credit fields are `title`, `artist`, optional `year` and `source`, descriptive `alt`, and the image's actual `width` and `height`. An optional `thumbnail` supplies a smaller card image. The browser editor exposes these fields under Featured image and Artwork credit.

Podcast episodes use their original episode thumbnails instead of paintings. Set `image` and, optionally, the top-level `thumbnail` field to the episode images; leave `artwork` empty. The existing player and episode body remain intact. For paintings, the thumbnail under Artwork credit remains supported; a top-level Small thumbnail takes precedence when supplied.

Thumbnails always fill their frames with a frontend crop. Article images and source files keep the complete composition. Store publication copies under `public/uploads/artwork/`, with embedded private metadata removed. Preserve originals outside this repository. When replacing an image, update its credit and dimensions and either replace or clear the old thumbnail. A painting's inclusion does not grant reproduction rights; check its source and the [rights guidance](RIGHTS.md).

The optional **Thumbnail crop** editor group adjusts framing without editing an image. Horizontal and vertical focus run from 0 to 100 (left/top to right/bottom), with 50 as the centered default. Zoom defaults to 1 and can increase to 3; a small increase can hide a paper border already present in a reproduction. Clear the group to restore centered cropping. Review the published thumbnail after changing it.

```yaml
thumbnailCrop:
  x: 50
  y: 35
  zoom: 1.08
```

## Podcast page

### Titles, subtitles and Blog sections

Blog navigation uses All posts, General, Podcast, Book Reviews and In Search of the Infinite, in that order. Older topic tags remain in source metadata and their links still work, but are not displayed as chips. Use one of the four sections for new posts.

Use the optional **Subtitle** field for an explicit subtitle. Otherwise cards use an opening Markdown heading or short emphasized subtitle, skipping generic headings such as Abstract and Introduction. A title's colon-separated subtitle is used when there is no opening subtitle; an excerpt remains the final fallback. Podcast titles display without a leading `Podcast:` in listings, articles, search and feeds. Source titles, bodies and URLs stay unchanged.

The Podcast page lists published posts tagged `Podcast`, newest first, with their original episode image, date, guest, opening excerpt and listening links. The image and Read more open the blog post. Edit the page's Markdown to change its introduction. Titles formatted as `Podcast: Topic with Guest Name` display the guest separately.

Optional **Spotify episode URL**, **Apple Podcasts episode URL** and **YouTube episode URL** fields are available in the post editor. Spotify and Apple fall back to the show pages when an episode URL is absent. YouTube uses the video embedded in the post unless overridden. For Markdown editing, use `spotify:`, `apple:` and `youtube:`. Images use the same frontend-only `thumbnailCrop` settings as Blog cards, retaining the original file.

## Interviews

The Interviews page uses the Podcast row layout with a click-to-play preview and one Watch link pointing to YouTube. Its Markdown remains the content source: use `## Topic | Show or host (Year)`, description paragraphs, then the YouTube URL. All description paragraphs in that source are displayed. A local episode thumbnail belongs at `public/uploads/interviews/VIDEO_ID.webp`; retain the original image and let the frontend crop it to fill the frame.

## Books and Talks page layouts

Books and Talks render their existing Markdown as structured rows. Books uses `## Title: Subtitle (Year)`, description paragraphs and its existing Blog/PDF/EPUB/Paperback links. A forthcoming publisher line supplies the status; an unavailable cover gets a typographic placeholder. The unpublished table-of-contents link stays out of the rendered listing.

Talks uses `## Title: Subtitle (Year)`, the YouTube URL, description paragraphs and a `[Transcript](/posts/...)` link. Its original video thumbnail belongs at `public/uploads/video-VIDEO_ID.webp`. Clicking a preview loads the YouTube player; Read more opens the transcript. No player loads until requested. Podcast platform buttons are ordered YouTube, Spotify, Apple, with episode URLs stored in each post's metadata.

## Book chapter thumbnails

The *In Search of the Infinite* posts use small, uncropped copies of their original embedded illustrations as `thumbnail` overrides. The Appendix keeps its painting because it has no embedded illustration. `thumbnailCrop` controls frontend framing only; the full original image, article artwork and credits stay intact.
