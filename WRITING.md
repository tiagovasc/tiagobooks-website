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

Thumbnails always fill their frames with a frontend crop. Article images and source files keep the complete composition. Store publication copies under `public/uploads/artwork/`, with embedded private metadata removed. Preserve originals outside this repository. When replacing an image, update its credit and dimensions and either replace or clear the old thumbnail. A painting's inclusion does not grant reproduction rights; check its source and the [rights guidance](RIGHTS.md).

The optional **Thumbnail crop** editor group adjusts framing without editing an image. Horizontal and vertical focus run from 0 to 100 (left/top to right/bottom), with 50 as the centered default. Zoom defaults to 1 and can increase to 3; a small increase can hide a paper border already present in a reproduction. Clear the group to restore centered cropping. Review the published thumbnail after changing it.

```yaml
thumbnailCrop:
  x: 50
  y: 35
  zoom: 1.08
```
