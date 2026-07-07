# Package Readiness Notes

Checked on 2026-07-07:

```bash
npm view promptdiff version --json
```

The public npm registry returned `E404` with an `Unpublished on 2026-04-22T07:57:12.207Z` note. Treat this as "not currently published" rather than a permanent claim of ownership. Re-check while authenticated immediately before publishing.

Current package hygiene:

- MIT license included.
- `package.json` exposes `dist/cli.js` as the `promptdiff` bin.
- `files` limits publishable contents to built output, docs, and examples.
- `.npmignore` excludes source, tests, local artifacts, and CI metadata as a backup.
- API keys are not read from config artifacts; external providers should use environment variables.
