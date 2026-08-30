# Scripts

## Product verification

- `e2e-smoke.mjs` — Playwright smoke test for the simulated hunt. Start Vite
  first, or set `BASE_URL` to a running deployment.
- `upload-clips-s3.mjs` — uploads optimized clips to the configured S3 bucket.
  It does not transcode unless run with `TRANSCODE=1`.

## Debug scripts

The root-level `debug-*.mjs` files are exploratory phone/deployment probes,
not product code or release checks. They may depend on a specific deployment
URL and should not be used as CI gates. When adding a new probe, put it under
`scripts/debug/` and document its target and assumptions at the top of the
file.
