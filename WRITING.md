# Writing and publishing

Published posts live in `src/content/posts/`, pages in `src/content/pages/`, and uploaded media in `public/uploads/`. Preserve filenames to keep existing URLs working.

## Public repository boundary

Everything committed here is public, including earlier revisions. Keep unfinished private work outside this repository. `draft`, `unlisted` and `protected` are rendering features, not GitHub privacy controls. The public-source check rejects entries with these flags enabled; use a separate private source repository if you need that workflow. Do not enter private text into this site's remote CMS.

## Browser editor

Open [Edit writing](https://tiagobooks.com/editor), or use the pencil in the header. Sign in with the same site password used for library administration. Choose a post or page, edit its Markdown and metadata, then select **Publish changes**. No GitHub sign-in or token is needed in this editor. Unsaved text stays in the current tab; it is not a private draft storage service.

Publishing creates a versioned commit in `tiagovasc/tiagobooks-website`, branch `codex/unified-site`, and triggers the host's build. The live site updates after a successful deployment, usually within a few minutes; a failed build leaves the last successful website live. Conflicting edits are rejected: copy your unsaved text, reload the entry and compare before retrying. Metadata is validated without reformatting the original Markdown. Private flags and recognizable credentials are rejected.

The [advanced GitHub editor](https://tiagobooks.com/admin/) remains available for its visual fields, media picker and navigation settings. That separate editor still requires a GitHub account with write access: use a fine-grained token restricted to this repository with Contents read/write. OAuth needs a separately configured provider. The following visual-field steps refer to this advanced editor.

1. Choose Posts or Pages and create an entry.
2. Add the title, date (for posts), tags, optional description and body.
3. Add images using the media picker and meaningful alternative text.
4. Save only content ready to be public. Review the deployment result.
5. Preserve the slug when editing; add an alias when changing an existing URL.

Navigation is editable in the advanced editor's Settings. A future date does not schedule publication. For local editing, follow the README and use `/editor`; Save locally and Rebuild preview stay local, with commits and pushes as separate steps.

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

Blog navigation uses All posts, General, Book Reviews and In Search of the Infinite. Podcast articles are currently hidden from the Blog listing and its category menu; they remain published and linked from the Podcasts page. Set `BLOG_VISIBILITY.showPodcastPosts` to `true` in `src/lib/post-presentation.mjs` and rebuild to restore both. Continue tagging episode articles Podcast; the presentation preference does not change content metadata, search or feeds. Older Podcast category links lead to the Podcasts page during this trial. Other topic tags remain in source metadata and retain their links, but are not displayed as chips.

Use the optional **Subtitle** field for an explicit subtitle. Otherwise cards use an opening Markdown heading or short emphasized subtitle, skipping generic headings such as Abstract and Introduction. A title's colon-separated subtitle is used when there is no opening subtitle; an excerpt remains the final fallback. Podcast titles display without a leading `Podcast:` in listings, articles, search and feeds. Source titles, bodies and URLs stay unchanged.

The Podcast page lists published posts tagged `Podcast`, newest first, with their original episode image, date, guest, opening excerpt and listening links. The image and Read more open the blog post. Edit the page's Markdown to change its introduction. Titles formatted as `Podcast: Topic with Guest Name` display the guest separately.

Optional **Spotify episode URL**, **Apple Podcasts episode URL** and **YouTube episode URL** fields are available in the post editor. Spotify and Apple fall back to the show pages when an episode URL is absent. YouTube uses the video embedded in the post unless overridden. For Markdown editing, use `spotify:`, `apple:` and `youtube:`. Images use the same frontend-only `thumbnailCrop` settings as Blog cards, retaining the original file.

## Interviews

The Interviews page uses the Podcast row layout with a click-to-play preview and one Watch link pointing to YouTube. Its Markdown remains the content source: use `## Topic | Show or host (Year)`, description paragraphs, then the YouTube URL. All description paragraphs in that source are displayed. A local episode thumbnail belongs at `public/uploads/interviews/VIDEO_ID.webp`; retain the original image and let the frontend crop it to fill the frame.

## Books and Talks page layouts

Post pages show the publication date and estimated reading time under the title. Chapter titles beginning `In Search of the Infinite - ` display with a colon; original metadata and URLs stay unchanged. Use normal Markdown lists (`- item`) in podcast summaries. When renaming a heading, retain an explicit anchor for its old fragment identifier so existing links keep working.

Books and Talks render their existing Markdown as structured rows. Books uses `## Title: Subtitle (Year)`, description paragraphs and its existing Blog/PDF/EPUB/Paperback links. A forthcoming publisher line supplies the status; an unavailable cover gets a typographic placeholder. The unpublished table-of-contents link stays out of the rendered listing.

Talks uses `## Title: Subtitle (Year)`, the YouTube URL, description paragraphs and a `[Transcript](/posts/...)` link. Its original video thumbnail belongs at `public/uploads/video-VIDEO_ID.webp`. Clicking a preview loads the YouTube player; Read more opens the transcript. No player loads until requested. Podcast platform buttons are ordered YouTube, Spotify, Apple, with episode URLs stored in each post's metadata.

## Book chapter thumbnails

The *In Search of the Infinite* posts use small, uncropped copies of their original embedded illustrations as `thumbnail` overrides. The Appendix keeps its painting because it has no embedded illustration. `thumbnailCrop` controls frontend framing only; the full original image, article artwork and credits stay intact.


## Linking an article hosted elsewhere

Create a normal post with its title, original publication date, tags, description and image. Set the optional **External article URL** (`externalUrl`) to the publisher's complete HTTPS URL. The Blog card/list keeps its regular design with no publication badge; its image and title open that URL. The local post permalink uses a temporary302redirect, so saved/search links also reach the original. Feed links point to the original article.

Use a short note/link as the body rather than copying the publisher's full text. If needed, set **Reading minutes override** (`readingMinutes`) to a positive whole-number estimate for the original article; otherwise reading time is calculated normally. Clear/remove `externalUrl` to return the entry to a normal local post. This uses the existing Posts collection and editor; no separate collection or migration is needed. Only HTTPS destinations without credentials/control characters are accepted.
