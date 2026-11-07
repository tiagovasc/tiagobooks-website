# Testing

Run all commands from the repository root with Node.js 22.19 or later:

```sh
npm run check:public
npm run build
npm test
npm run check:build
```

`tests/` contains website, editor, library synchronization and recovery regression tests. `library/test-*.mjs` covers the library server and catalogue components. `scripts/test-*.mjs` contains focused content/media/link tools. The npm test command lists the hosted regression suite explicitly, including physical-library correction and withdrawal checks.

Tests create synthetic records, temporary files and temporary Git repositories. Local HTTP tests need permission to open loopback connections. They must never use production credentials or write to the production database. Build-dependent tests require a successful build first.

For a focused check, use `node --test tests/test-physical-library.mjs` or another named test. After relocating a test, update its relative imports and `package.json`; preserve root-relative fixture and content paths.

GitHub Actions runs the same public-source guard, build, full tests and build verification. Review the exact committed diff before pushing: a passing later check cannot undo a secret already published.
