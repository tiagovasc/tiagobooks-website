# Tiago Books

The source for [tiagobooks.com](https://tiagobooks.com): Tiago Faleiro's personal library, blog, essays, podcast and other pages, with one shared interface.

Browse the library in cover, list or table view; filter reading status and TBR collections; explore the blog by tag and date; or search across books and writing. The site includes full-content Atom feeds, stable links, light and dark themes, and authenticated editing.

## Run locally

Use Node.js **22.19 or later** and npm.

```sh
npm ci
npm run build
npm run dev
```

Open **http://localhost:8740**. The first launch creates an empty local catalogue in ignored `.local/`. Published blog content and TBR data are included; the live library database and credentials are not. A local clone never connects to the live database by default.

To edit locally, copy `.env.example` to `.env`, set your own `LIBRARY_PASSWORD`, and restart. Sign in at `/login`, then use the library controls or `/editor`. Local edits change your Markdown files; review them before committing. Rebuild with `npm run build` after source changes. `npm run dev` serves the built site rather than a hot-reloading development server.

## Project map

| Path | Purpose |
| --- | --- |
| `src/content/posts`, `src/content/pages` | Published Markdown |
| `src/data/site.json` | Site identity and navigation |
| `src/layouts`, `src/pages`, `src/lib`, `src/components` | Astro pages, episode lists and shared rendering |
| `library/` | Library interface, API, public covers and TBR catalogue |
| `public/` | Shared styles, scripts, uploads, platform icons and vendored Sveltia CMS |
| `server.mjs`, `editor-api.mjs` | Node server and local editing |
| `scripts/` | Build, content and link checks |

Astro generates the blog; Pagefind indexes writing; the Node server combines it with the library API and catalogue search. Production library storage uses Supabase. The Docker image runs Node without installing build dependencies at startup.

## Check changes

```sh
npm run check:public
npm run build
npm test
npm run check:build
```

Tests use synthetic library records. They exercise content routes, search, feeds, redirects, authentication, saving, editor round trips and server protections. GitHub Actions runs these checks for pushes and pull requests.

## Hosting and editing

- [Deployment guide](DEPLOYMENT.md): Docker, configuration and storage.
- [Writing guide](WRITING.md): Markdown, media and the CMS.
- [Link guide](LINKS.md): redirects, domain changes and validation.
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md) and [content rights](RIGHTS.md).

**Public source means public content.** Do not commit private drafts, passwords, backups or personal catalogue exports. Draft, unlisted and password-protected flags affect website rendering; they cannot hide Markdown in a public repository. Private writing belongs outside this checkout until it is ready for publication.
