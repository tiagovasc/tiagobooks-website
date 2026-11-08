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

## Failure isolation and recovery

Rejected individual fields receive ordinary protocol-1 conflict receipts, so a malformed draft cannot block unrelated favorites in an already-open page. The rejected value and reason stay in the outbox for review/recovery. Invalid batch identities or duplicate operation IDs still reject the whole request. New clients split definite validation/size failures when talking to an older server; transient network/server failures retain and retry the original operation IDs.

Queued operations follow their field predecessors even when tabs were opened at different times or the clock changes. Attempted payloads remain immutable. A same-value acknowledgement can resolve a dependent operation within a batch only if its original field version still matches; another session's intervening version still requires review. Complete, unique receipts are required before any corresponding drafts are marked confirmed.

Confirmed own fields remain visible if fetching another session's newer snapshot fails. The status distinguishes saved changes awaiting refresh from unsent changes; subsequent saves cannot silently clear that refresh requirement. Failed requests expose their HTTP status and a short server explanation on the status row's tooltip, and recovery downloads include current sync diagnostics. A healthy heartbeat cannot hide a failed save.

Optional paused plans may be cleared or left empty without assigning a classification. Normalizing existing records for display does not create absent fields in save payloads.

The mobile section tabs occupy a full-width horizontal row with a scroll arrow and thin scrollbar; layout/filter/sort/add/admin tools sit on a separate row. The Favorites filter uses an accessible heart icon (36px desktop, 44px mobile). These controls do not change sync or book data.

## First-page presentation previews

**Schema2 / coherent layout update, 8 November 2026:** preview data also carries full status counts, complete per-source month counts and public bookshop filter options. These are presentation-only aggregates; they do not enter canonical state or editing baselines. Preview calendars remain inert until authoritative data arrives. Version1 caches are ignored. The toolbar, headings, first rows and dates are revealed together after deferred controls and header measurements settle. The owner's initial “Checking changes…” row and mounted sync status share the same reserved space, without changing the save/outbox protocol.

Public pages warm a small `/api/library-preview` response and the first four responsive rows of Owned/TBR All covers after the current page loads and the browser is idle. The preview lives in sessionStorage for at most90seconds and is revalidated once per minute while the source page remains visible, keeping it ready during long article visits. It contains allowlisted public presentation fields only, at most64Owned records and48per TBR source, rather than the complete catalogue. Data Saver/2G skip warming. This is a temporary display optimization, never an offline catalogue or an editing baseline.

On Library/TBR entry, a valid matching default-cover preview can appear immediately in an inert container while the existing authoritative requests run. Filters, non-default sorting and other layouts use normal loading. Preview records never enter `state.books`, the sync outbox, metadata baselines or save payloads. Saves are gated during initial loading/preview. Successful authoritative rendering removes the inert preview; failure shows the load error. Full TBR metadata then warms in the background for fast subsection changes. Favorites, ownership and all edits still use the existing server-backed synchronization protocol. No service worker, speculation/prerender requirement or persistent full-catalogue cache is added.


## Paused reading plans

8 November 2026: Paused remains one reading status, with a separate canonical `pause_plan` field. Values `return` and `unfinished` display as **Return to** and **Unfinished**. An absent plan remains Paused without an inferred classification. The Paused-only filter intersects existing search, favorites and other filters. Default date sorting groups Return to first, then Unfinished; other explicit sorts retain their meaning. The editor exposes both choices while paused, and newly paused books default to Return to. The plan uses the existing per-field versioned sync/outbox protocol, never a whole-catalogue save. Changing status retains the plan for a future pause.

Initial classification requested by the owner: Experiments in Mystical Atheism, The Philosophers' Library, Religion and Nothingness, and the three currently-reading Dante volumes are Return to. Immune and Of Cabbages and Kimchi are Unfinished. Existing book identities, ownership, favorites, history and TBR memberships are preserved. Christopher Butler's existing Postmodernism: A Very Short Introduction is completed on 2026-11-08.


## Shared TBR toolbar

8 November 2026: TBR retains the same layout, filter, sort, favorites, Add book and admin-menu slots as other Library sections. Add book and admin tools remain authenticated-only. The TBR filter panel operates on TBR ownership; existing city/bookshop filters remain available under Book shops. Its filter state is independent of the Library filters and intersects source, search and favorites. Sort options still reflect the selected collection. Sync status remains admin-only. This presentation fix does not mutate book data.


**Paused wording update, 8 November 2026:** the owner chose **For later** (stored `pause_plan: return`) and **Shelved** (stored `pause_plan: unfinished`). These replace the earlier Return to / Unfinished presentation labels in filters, group headings and editor choices. Stored values and book classifications are unchanged. The separate unfinished-reading marker on Read books retains its existing wording and meaning.
