# Deployment

The production application uses the included Dockerfile and Railway configuration. Other Docker hosts need the same environment, persistent Supabase storage and an HTTPS reverse proxy.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public HTTPS origin; required at build and runtime |
| `CMS_REPOSITORY` | GitHub `owner/repository` for the editor |
| `CMS_BRANCH` | Branch the editor publishes to |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only Supabase service credential |
| `LIBRARY_PASSWORD` | Your library administrator password |
| `SESSION_SECRET` | A long random server-only session signing secret |
| `PORT` | HTTP listening port; Docker defaults to 8080 |

Use host-managed secrets. Never put credentials in Docker build arguments, source, screenshots or issue reports. Only the public site/CMS configuration is needed during the build. The Dockerfile sets `NODE_ENV=production` and `HOST=0.0.0.0`.

## Storage

Run `library/supabase.sql` in **your own** Supabase project, then initialize the `library` row with an empty `books` array and `revision` 1. The table has row-level security enabled and denies direct anonymous/client access. Keep the service credential on the server. Import your own catalogue through the authenticated library UI; back up existing records before replacing them.

The live site's database is separate from this repository. A fresh deployment does not include or grant access to it. `LOCAL_LIBRARY_FILE` is for local development and is rejected in production.

## Build and deploy

Connect your repository and intended branch to the host, configure the variables, and deploy the Dockerfile. Supply `SITE_URL`, `CMS_REPOSITORY` and `CMS_BRANCH` to the build as well as runtime. Point the domain at your host and enable HTTPS. `/healthz` checks the built blog, search index and library storage.

The published Tiago Books site tracks `codex/unified-site`. Forks should set their own repository, branch, branding and domain before enabling CMS writes.

Verify `/`, `/blog`, `/search`, `/posts_feed`, `/admin/config.yml` and `/healthz`; then check authenticated library saving and a CMS publication using your own account. Run `node scripts/check-links.mjs --live https://your-domain.example` with `SITE_URL` set to that origin after building it.

## Recovery

Keep database backups and any private source snapshots outside Git. Roll back application code using your host's previous successful deployment or a reviewed Git commit. Database recovery is separate: do not overwrite a newer catalogue merely to roll back the UI.
