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

Favorites use an optional boolean `favorite` on each book in the existing `books` JSONB array. Missing means false, so existing catalogues need no SQL migration or bulk rewrite. Signed-in owners toggle hearts through the normal revision-checked save; visitors see the selected covers and Favorites section without edit controls. JSON/CSV exports retain the field. Ratings, reading status and tags are independent.

## Build and deploy

Connect your repository and intended branch to the host, configure the variables, and deploy the Dockerfile. Supply `SITE_URL`, `CMS_REPOSITORY` and `CMS_BRANCH` to the build as well as runtime. Point the domain at your host and enable HTTPS. `/healthz` checks the built blog, search index and library storage.

The published Tiago Books site tracks `codex/unified-site`. Forks should set their own repository, branch, branding and domain before enabling CMS writes.

Verify `/`, `/blog`, `/search`, `/posts_feed`, `/admin/config.yml` and `/healthz`; then check authenticated library saving and a publication through `/editor`. Anonymous `/editor` should redirect to site login, and `/api/editor` must reject anonymous and cross-origin writes. Run `node scripts/check-links.mjs --live https://your-domain.example` with `SITE_URL` set to that origin after building it.

## Recovery

Keep database backups and any private source snapshots outside Git. Roll back application code using your host's previous successful deployment or a reviewed Git commit. Database recovery is separate: do not overwrite a newer catalogue merely to roll back the UI.
