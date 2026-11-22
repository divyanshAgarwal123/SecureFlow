# Expired suppression rule verification

Source commit `2a63beaa9cf6d60599389701a7898ab92bea3786` based on `dbc964f7f6ab4b7dffe6f9d04a280d62d6ff9d23`.

Chromium exercised the real Next.js admin route using the repository's local test-auth configuration, a disposable PostgreSQL database, and synthetic rules. The browser test checked keyboard focus and date validity, persisted renewal, the audit entry, and rejected stale edits and repeat renewal. It also verified that an ordinary edit preserves the existing timestamp. The test fixture is intended for an isolated test instance only.

Four focused Vitest files passed all 32 tests. Scoped ESLint reported zero errors. Default Turbopack production builds fail on this branch and the exact upstream parent because the tracing module imports an unavailable OpenTelemetry export. TypeScript reports the same two tracing errors on both revisions. The browser report is from Webpack development mode.
