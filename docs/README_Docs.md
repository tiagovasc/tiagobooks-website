# Basics

Project documentation for tiagovf.com lives here. Start with deployment for hosting, writing for publishing, and library synchronization for editing behavior. Published essays and pages live separately under `src/content/` because they are website content, rather than project documentation.

# Table of Contents

- [Basics](#basics)
- [Table of Contents](#table-of-contents)
- [Maintenance](#maintenance)
- [What Belongs Here](#what-belongs-here)
- [How This Folder Works](#how-this-folder-works)
- [How to Add or Edit](#how-to-add-or-edit)
- [Changelog](#changelog)
- [Reminders](#reminders)
- [MISC](#misc)

# Maintenance

Keep this index, the root README and linked guides current when setup, structure or behavior changes. Keep operational secrets, machine-specific storage details and private recovery evidence outside the public checkout.

# What Belongs Here

| Guide | Purpose |
| --- | --- |
| [Deployment](DEPLOYMENT.md) | Configuration, hosting, storage and recovery |
| [Writing](WRITING.md) | Markdown, artwork, external articles and editing |
| [Library synchronization](LIBRARY_SYNC.md) | Drafts, saves, version checks and conflicts |
| [Testing](TESTING.md) | Checks, test locations and fixture safety |
| [Links](LINKS.md) | Stable URLs, redirects and validation |
| [Contributing](CONTRIBUTING.md) | Focused changes and issue reports |
| [Security](SECURITY.md) | Private reporting and public-source safeguards |
| [Rights](RIGHTS.md) | Source, writing and third-party asset rights |
| [Physical-library corrections](PHYSICAL_LIBRARY.md) | Safe canonical identity and ownership maintenance |

# How This Folder Works

Guides describe repository-root paths unless a link explicitly points elsewhere. The root README remains the public landing page; all detailed project Markdown belongs here. Blog Markdown remains in the content collection.

# How to Add or Edit

Add focused guides here, link them from this index, and update affected references. Run the public-source guard and relevant tests before publishing. Avoid credentials, local paths, catalogue exports and private migration receipts.

# Changelog

- November 2026: consolidated project guides into `docs/`, moved root regression tests into `tests/`, and retained the original public content paths.

# Reminders

Moving documentation does not change production data or authorize restoring an older library snapshot.

# MISC

The main [README](../README.md) covers local setup and the repository map.
