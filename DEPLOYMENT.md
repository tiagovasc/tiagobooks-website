# Deployment

The production application uses the included Dockerfile and Railway configuration. Other Docker hosts need the same environment, persistent Supabase storage and an HTTPS reverse proxy.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public HTTPS origin; required at build and runtime |
| `CMS_REPOSITORY` | GitHub `owner/repository` for the editor |
| `CMS_BRANCH` | Branch the editor publishes to |
| `CMS_GIT_SSH_KEY` | Server-only OpenSSH private deploy key; write access to this repository only |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only Supabase service credential |
| `LIBRARY_PASSWORD` | Your library administrator password |
| `SESSION_SECRET` | A long random server-only session signing secret |
| `PORT` | HTTP listening port; Docker defaults to 8080 |

Use host-managed secrets. Never put credentials in Docker build arguments, source, screenshots or issue reports. Only the public site/CMS configuration is needed during the build. The Dockerfile sets `NODE_ENV=production` and `HOST=0.0.0.0`.

The password editor uses the existing signed administrator session. Generate a dedicated Ed25519 SSH key, add its public key as a write-enabled deploy key on the website repository, and store the private key only as the multiline runtime secret `CMS_GIT_SSH_KEY`. Do not use an account-wide GitHub token. Git connects to `ssh.github.com:443` with GitHub's pinned Ed25519 host key. Temporary bare Git storage retrieves current source and pushes ordinary commits without force; content filenames, metadata, origin and revision are checked before writing. No key is sent to the browser. Missing publishing configuration disables saves without affecting the public website or the advanced `/admin/` editor.

Rotate the publishing key by adding a replacement deploy key and updating the runtime secret, then revoke the old key after verification. Removing the deploy key disables this publishing path. Keep the existing login password and session secret private; both library and writing administration share that access.

## Storage

Run `library/supabase.sql` in **your own** Supabase project, then initialize the `library` row with an empty `books` array and `revision` 1. The table has row-level security enabled and denies direct anonymous/client access. Keep the service credential on the server. Import your own catalogue through the authenticated library UI; back up existing records before replacing them.

The live site's database is separate from this repository. A fresh deployment does not include or grant access to it. `LOCAL_LIBRARY_FILE` is for local development and is rejected in production.

Owned-library favorites use an optional boolean `favorite` on each book in the existing `books` JSONB array. Missing means false, so existing catalogues need no SQL migration or bulk rewrite. Signed-in owners toggle hearts through the normal revision-checked save; visitors see the selected covers without edit controls. JSON/CSV exports retain the field. Ratings, reading status and tags are independent.

Favorites is a filter within each reading section and every TBR source, rather than a separate section. TBR selections use independent per-book JSON objects in the private Supabase Storage bucket `tiagovf-book-favorites`, created on the first owner selection through the website's existing server-only service credential. The public `/api/tbr-favorites` read returns selected IDs; writes require the signed-in owner, same origin and a valid current catalogue ID. Catalogue/source records are never rewritten. Local development uses a companion `.tbr-favorites.json` file beside the local library, with atomic writes. Back up the bucket separately from the library row; keep it when rolling back UI code.

TBR ownership badges are read-only indicators derived from the current library through `/api/tbr-owned`. Only records with `owned: true` contribute: explicit `tbr_ids` links or complete normalized title/author matches (including stored subtitles). Matching ignores case, punctuation, accents and author-name token order; it uses no fuzzy titles or reading-status inference. Uncertain matches remain unlabelled. No catalogue or database rewrite is required.

## Library synchronization

`LIBRARY_SYNC.md` is the current hosted editing contract. Protocol-1 per-field operations, durable local drafts, internal field versions, safe retries, conflict review and revision/build polling supersede the earlier separate hosted save queues. Deploy compatible readers/writers together; no startup database rewrite is introduced. Keep pending browser outboxes compatible when rolling back. Maintenance writers must preserve `_sync_versions` and stamp fields they change (or use the sync API); never replace the database from an old full export. The unapproved title preview is separate from this release.

## Build and deploy

Connect your repository and intended branch to the host, configure the variables, and deploy the Dockerfile. Supply `SITE_URL`, `CMS_REPOSITORY` and `CMS_BRANCH` to the build as well as runtime. Point the domain at your host and enable HTTPS. `/healthz` checks the built blog, search index and library storage.

The published Tiago Books site tracks `codex/unified-site`. Forks should set their own repository, branch, branding and domain before enabling CMS writes.

Verify `/`, `/blog`, `/search`, `/posts_feed`, `/admin/config.yml` and `/healthz`; then check authenticated library saving and a publication through `/editor`. Anonymous `/editor` should redirect to site login, and `/api/editor` must reject anonymous and cross-origin writes. Run `node scripts/check-links.mjs --live https://your-domain.example` with `SITE_URL` set to that origin after building it.

## Recovery

### Shared book identities (November 2026)

`library/book-reconciliation.json` contains reviewed identity links and the eight-volume Continental Philosophy expansion. TBR rows retain their original IDs, source arrays, sightings and order, and reference a single underlying database book through `book_id`. The existing JSONB array stores canonical books; `library_member: false` hides discovery-only records and the preserved original set from the main library. Library saves retain these records and protected source history. The eight individual volumes are owned; only volume 1 is read. The original set's complete record, notes and rating remain in `series_original_record` on the collection.

Deploy compatible readers/writers with `activate: false` first. Verify `/api/book-reconciliation` reports `ready`, then deploy `activate: true`. Production startup first saves the complete authenticated database row into the **private** `tiagovf-library-backups` bucket and verifies byte-for-byte readback. It then updates the row with revision comparison; a concurrent edit triggers a fresh backup and retry. Failure stops startup before an unsafe write. The safe status endpoint reports the backup hash and counts, never database contents or credentials. Subsequent startup is idempotent. Expected memberships after the explicitly requested volume expansion: Library 1,007; TBR 5,227. All nine original TBR favorite selections are imported, alongside owned favorites. Canonical favorites then use the same revision queue as Library edits; the old favorite bucket remains preserved for recovery.

Application rollback must use the compatible shared-identity version or later. Do not deploy older readers that treat every canonical record as a Library membership. Database rollback requires the verified private snapshot and a review of subsequent edits; never overwrite newer changes merely to roll back presentation.

Keep database backups and any private source snapshots outside Git. Roll back application code using your host's previous successful deployment or a reviewed Git commit. Database recovery is separate: do not overwrite a newer catalogue merely to roll back the UI.

## Discovery chronology — November 2026

**Presentation correction, 7 November 2026:** the UI now displays only month/year (for example `Jun 2026`), without estimation labels, notices or tooltips. This supersedes the previous frontend `Est.` requirement below; keep the full dates and estimation basis intact in stored metadata/internal documentation. TBR reuses the Library's existing year/month navigation: desktop left rail, mobile month picker, filtered counts, lazy month jumps, and reading-navigation restoration when leaving TBR. It is available for chronological sorts in All and every source, and hides for title/author sorting or empty results. No catalogue or database date changes are made by this presentation correction.

TBR defaults to newest discovery first. Bookshop sighting `photo_order` ranks are computed from exact private capture timestamps; public actual photo dates remain month-only. Global `chronology_order` interleaves All using each membership's latest discovery across its sources, with `chronology_source` selecting the displayed date. Source-specific `discovery_dates` distinguish estimates from actual month-level photo dates. Instagram estimates span 2021-11-06 → 2026-11-06; Online spans 2017-01-01 → 2026-11-06, evenly spaced in their preserved source order. These fixed anchors were chosen on 2026-11-07 and must not shift on builds. Estimated dates are labelled `Est.` and do not represent verified publication/save dates. Keep the catalogue's `chronology` header, all source memberships and photo ranks when regenerating metadata. New real discovery dates should not stretch or replace earlier estimates. This is static membership metadata; no database migration or favorite/book edits are needed.
