# Links and domain changes

Use paths such as `/pages/books`, `/posts/example` and `#section` for links within the blog. These follow whichever domain the reader is using. Keep complete URLs for other websites.

## Change the publishing domain

1. Add the previous origin to `src/data/link-policy.json` if it is not already listed. This list recognises historical addresses pasted into future posts; it does not grant access or fetch their content.
2. Set `SITE_URL` in the host environment to the new complete origin, such as `https://example.com`. Rebuild and deploy. For local builds, the fallback is `src/data/site.json`.
3. The same build sets canonical/social URLs, sitemap, robots sitemap reference, feed base and CMS site/display URLs. No content-wide replacement is needed. Feed identifiers remain stable so subscribers do not receive duplicate entries.
4. Check the new deployment with `npm run check:links` and the live option described below. DNS and redirects from an old domain still need to be configured at that domain's host; changing content cannot redirect a domain you do not control.

The build never rewrites source settings as a deployment side effect. This works with ordinary `npm run build`, not only the Railway Dockerfile.

## Preview and apply a bulk content migration

Run `npm run links:plan` first. It writes `data/links-plan.json` and reports the number of URL changes without editing content. Review that plan, then run `npm run links:apply`.

The migration parses Markdown links, images, reference definitions, autolinks and raw HTML URL attributes. It changes URL spans only, preserving prose, whitespace and code examples. Protected, unlisted, draft and private-named entries are skipped. Applying requires public content to match a recoverable Git commit, accepting only Git's normal line-ending conversion. It verifies each written file and creates a timestamped `data/link-migration-*.json` receipt containing before/after hashes and exact changes.

To reverse a migration, run `npm run links:undo` followed by the receipt path as an argument. The undo command refuses to overwrite files edited since migration and verifies the restored hashes. Commit intended content edits before applying a future migration. Running the migration again after a successful pass should report zero changes.

## Renamed and unavailable pages

Keep path redirects in `public/_redirects`, or use an entry's existing `aliases` field. Both are applied to final rendered links and translated for Railway by the existing deployment script. Preserve query strings and fragment identifiers; redirects must not cycle.

`unavailablePaths` in `src/data/link-policy.json` explicitly marks content that is not published. Links to those paths render as labelled text with “not yet available”, rather than sending a reader to the old site or a missing page. Remove that exception only when an authorised public destination exists. This never imports or reads private content.

## Verification

Every build runs the link check after HTML preparation and search indexing. It checks internal targets, fragments, obsolete absolute addresses and the domain settings for canonical/social URLs, CMS, sitemap, feed and robots. A broken internal link fails the build. Third-party links are left unchanged; the check does not claim to validate their availability.

For a live check, set `SITE_URL` to the deployed origin and run `node scripts/check-links.mjs --live https://example.com` directly. This avoids npm argument forwarding differences in PowerShell. This fetches every built public page, plus CMS configuration, sitemap, feed and robots, then checks the actual served hyperlinks. Confirm that the report says `live: true`. The ignored report is `data/link-check-report.json`.

Regression fixtures: `scripts/test-links.mjs`.
