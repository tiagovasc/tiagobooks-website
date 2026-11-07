# Tiago Faleiro

The source for [tiagovf.com](https://tiagovf.com): a personal website about philosophy, books and the questions that connect them.

[Blog](https://tiagovf.com/) · [Library](https://tiagovf.com/library) · [Podcasts](https://tiagovf.com/pages/podcast-overview) · [About](https://tiagovf.com/pages/about)

## What’s inside

- Essays, book reviews, talks, interviews and podcast episodes.
- A personal library with reading histories, favorites and owned-book labels.
- TBR collections spanning bookshops, online finds and Instagram.
- Search across books and writing, publication archives, feeds, and light/dark themes.
- Authenticated editing with durable local drafts and conflict-aware synchronization.

Built with **Astro**, **Node.js**, **Pagefind** and **Supabase**. Visitors browse the public catalogue; editing requires the owner's account. Production secrets and the live library database are stored outside this repository.

## Get started

Use Node.js **22.19 or later**.

```sh
npm ci
npm run build
npm run dev
```

Open **http://localhost:8740**. A fresh clone uses an empty local library and does not connect to the production database. Published writing and TBR data are included. For local editing, copy `.env.example` to `.env`, choose your own library password and restart.

## Project map

| Folder | Contents |
| --- | --- |
| [`docs/`](docs/README_Docs.md) | Setup, deployment, writing, synchronization and contributor guides |
| `src/` | Published Markdown, Astro pages, layouts and shared components |
| `library/` | Library interface, API, public catalogue and book covers |
| `public/` | Shared styles, browser scripts, artwork and static assets |
| `scripts/` | Build, validation and maintenance tools |
| `tests/` | Website and library regression tests |

Root-level JavaScript files are the Node application entry points and publishing/storage modules. Blog posts and pages stay under `src/content/` so their publishing paths remain stable.

## Check a change

```sh
npm run check:public
npm run build
npm test
npm run check:build
```

Tests use synthetic records and temporary repositories. GitHub Actions runs these checks for pushes and pull requests. Keep this guide and the relevant documentation current when changing setup, structure or behavior.

## Documentation

[Deploying](docs/DEPLOYMENT.md) · [Writing](docs/WRITING.md) · [Library synchronization](docs/LIBRARY_SYNC.md) · [Testing](docs/TESTING.md) · [Contributing](docs/CONTRIBUTING.md) · [Security](docs/SECURITY.md) · [Rights](docs/RIGHTS.md)

Public source means public content: keep drafts, credentials, local databases, exports and recovery copies outside the repository. Website visibility settings cannot make a committed file private.

The repository is available for inspection; writing, artwork and third-party materials retain their respective rights. See the [rights guide](docs/RIGHTS.md) before reusing them.
