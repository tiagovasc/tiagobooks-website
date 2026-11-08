# Library editing and updates

The hosted Library saves individual field changes rather than replacing the library from an old page snapshot. Library and every TBR subsection share canonical favorites.

The small status row shows whether changes are confirmed online, queued on this device, awaiting sign-in or need review. Temporary failures retry automatically. Queued changes survive refresh. A recovery download is available while changes are pending.

New database data is checked every 15 seconds while visible, and when returning to the page. An open editor keeps its displayed baseline until editing finishes. Updates preserve the selected section, source, filters and scroll position.

A new application build offers an update button. It does not reload automatically over edits. The first upgrade from older scripts requires one ordinary refresh; subsequent versions can notify upgraded pages.

If two sessions change the same field differently, Review shows both values. Choose Keep my change or Use saved value. Other fields continue syncing. Favorites are not inferred from stale whole-library exports.

## Implementation contract

- Protocol 1: authenticated `GET/POST /api/library-sync`; public-safe `GET /api/library-state`.
- Per-field before-values and version tokens; immutable attempted operation IDs; database revision CAS; idempotent retries; no blind stale overwrite.
- Compact synchronous pending outbox with independent keys; confirmed history archived to IndexedDB only after readback. Storage failures stay visible. Recovery exports include displayed drafts.
- Internal `_sync_versions` metadata is preserved by legacy writers and omitted from public output. Canonical identities, memberships, provenance, corrections, dates and unrelated fields remain intact.
- Unknown-baseline legacy favorite journals require review when they differ from the server. Original legacy snapshots remain preserved; they are not automatically imported.
- Same-origin tabs coordinate through Web Locks/BroadcastChannel and shared durable storage. Server checks remain authoritative without those browser features.
- No service worker or offline full-catalogue cache is introduced. Data requests bypass/revalidate caches; new-code notification uses a content/build fingerprint.

Run `npm test`, build/public checks and actual-page browser recovery tests before changing these guarantees. Rollback must retain protocol/outbox compatibility. Never restore an old complete database to roll back application code.

Browser drafts remain local until confirmed online. Clearing site data removes local drafts/history.

## First-page presentation previews

Public pages warm a small `/api/library-preview` response and the first four responsive rows of Owned/TBR All covers after the current page loads and the browser is idle. The preview lives in sessionStorage for at most90seconds and is revalidated once per minute while the source page remains visible, keeping it ready during long article visits. It contains allowlisted public presentation fields only, at most64Owned records and48per TBR source, rather than the complete catalogue. Data Saver/2G skip warming. This is a temporary display optimization, never an offline catalogue or an editing baseline.

On Library/TBR entry, a valid matching default-cover preview can appear immediately in an inert container while the existing authoritative requests run. Filters, non-default sorting and other layouts use normal loading. Preview records never enter `state.books`, the sync outbox, metadata baselines or save payloads. Saves are gated during initial loading/preview. Successful authoritative rendering removes the inert preview; failure shows the load error. Full TBR metadata then warms in the background for fast subsection changes. Favorites, ownership and all edits still use the existing server-backed synchronization protocol. No service worker, speculation/prerender requirement or persistent full-catalogue cache is added.
