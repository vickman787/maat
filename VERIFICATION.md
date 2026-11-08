# Verification record

Date: 8 November 2026
Platform: Windows 11 x64, Node.js 24.15.0, pnpm 12.18.0, Next.js 15.5.29, Chrome (Playwright
`channel: "chrome"`).

This file records commands that were actually run and their results. Items that were not run are
listed as not run.

## Automated checks

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | **PASS** — no TypeScript errors |
| `pnpm exec eslint app components lib worker tests` | **PASS** — 0 errors, 0 warnings |
| `pnpm exec vitest run` | **PASS** — 9 files, 48 tests |
| `pnpm exec next build` | **PASS** — optimized production build; all routes emitted |
| `pnpm exec playwright test` | **PASS** — 5 browser tests, 1 worker, Chrome channel |

The first production build attempt with `output: "standalone"` failed on Windows with `EPERM` while
Next copied traced symlinks. Standalone output is now opt-in (`pnpm build:standalone` /
`MAAT_STANDALONE=1`) and is intended for a Linux host. The normal production build above passes. No
standalone build was executed on Linux in this environment.

## Unit and integration coverage (Vitest)

- Money parsing: commas, currency symbols, exact minor units, decimal precision, zero/negative/refund
  rejection, formatting, date validation.
- CSV: BOM, CRLF, quoted commas, quoted newlines, duplicate headers, malformed rows, row limits,
  mapping suggestions, duplicate IDs, mixed currency, invalid amounts/dates, raw-value retention.
- Matching: canonical fixture, nine auto-allocations, partial/ambiguous/unpaid exceptions,
  amount-only coincidence, duplicate references, existing allocations.
- Workflow: canonical totals before/after review, duplicate confirmation, undo/reversal, manual
  allocation caps, cross-workspace denial, file-backed persistence, idempotent repeat processing,
  interrupted-job recovery, retry refusal for non-failed jobs.
- Demo: seeding, reset isolation, expiry cleanup, rate limiting, validation failures leaving no batch.
- Reports: CSV formula escaping, export totals equal database, one unallocated payment after confirm,
  decision count, snapshot source hashes.
- AI: valid provider response with metadata, cache reuse, unknown evidence rejection, provider HTTP
  failure, unconfigured fallback, success/failure inside a real job while deterministic results stay
  intact. **The provider is a local mock OpenAI-compatible server, not a real external model.**
- Privy: locally generated ES256 keys/JWKS verify audience, issuer, expiry, DID subject, and
  identity-token email parsing. **No real Privy email was delivered.**
- Sessions: signed user/demo round trip, tamper rejection, expiry.

## Browser walkthrough (Playwright)

1. Owner performed a real Privy email OTP login in the running app. The local database recorded one
   verified `did:privy:` user and one owner workspace. A separate browser check confirmed the modal
   uses the approved logo with no Google or wallet options.
2. Landing -> Explore demo -> dashboard.
3. Verified canonical figures: USD 18,000 invoiced, USD 16,500 payments, 9/12 exact, 3 to review,
   2 unallocated payment rows totaling USD 3,000.
4. Workbench -> Partial tab -> INV-010 evidence.
5. Verified rule-based fallback label with no configured AI.
6. Confirmed the USD 1,000 partial; verified USD 500 outstanding, USD 14,500 confirmed, USD 3,500
   outstanding, one unallocated payment (P011, USD 2,000).
7. Downloaded reconciliation and unallocated CSVs through authenticated handlers and checked values.
8. Opened the printable report and checked unresolved items.
9. Undid the allocation; verified reversal event and restored totals.
10. Reloaded the page and confirmed persistence.
11. Exited the demo and cleared the local session.
12. Created a real workspace session in the test database, uploaded both sample CSVs through the
    browser, waited for actual worker stages, and verified matching and persistence.
13. Confirmed a second workspace receives 403/404 for the first workspace's export and review.
14. Uploaded duplicate invoice IDs and verified exact row/column validation text.
15. Opened and closed the mobile navigation drawer; asserted no page-level horizontal overflow at
    390px and 768px.

Actual screenshots (not design mockups):

- `docs/screenshots/00-login-1440.png` (Privy modal open)
- `docs/screenshots/01-landing-1440.png`
- `docs/screenshots/02-dashboard-390.png`
- `docs/screenshots/03-batches-390.png`
- `docs/screenshots/04-dashboard-1440.png`
- `docs/screenshots/05-workbench-1440.png`
- `docs/screenshots/06-review-1440.png`
- `docs/screenshots/07-report-1440.png`
- `docs/screenshots/08-public-review-1440.png` (against the live Vultr URL)

## Financial values verified

Before review (canonical fixture):

- invoiced 1,800,000 minor (USD 18,000.00)
- imported 1,650,000 minor (USD 16,500.00)
- confirmed 1,350,000 minor (USD 13,500.00)
- outstanding 450,000 minor (USD 4,500.00)
- unallocated 2 rows / 300,000 minor (USD 3,000.00)
- exact 9, partial 1, unpaid 1, ambiguous 1

After confirming P010 (USD 1,000):

- confirmed 1,450,000 minor (USD 14,500.00)
- outstanding 350,000 minor (USD 3,500.00)
- unallocated 1 row / 200,000 minor (P011, USD 2,000.00)
- P010 remaining 0

After undo: totals return to the pre-review canonical values, with both the original confirm event
and the reversal preserved.

## Production deployment (Vultr)

Deployed on 8 November 2026 to the reported Ubuntu 24.04 VM at `199.247.1.174` using a dedicated
SSH key, Node.js 22.23.4, pnpm 12.18.0, Caddy 2.11.9, systemd services, and SQLite under
`/opt/maat/data`.

Verified over HTTPS at **https://199-247-1-174.sslip.io**:

- `GET /api/health` returned `200` with `database: ok`.
- Landing page returned `200` and contained the product promise and demo action.
- Demo creation returned `200`; the dashboard rendered the demo label and November batch.
- The worker completed the canonical job with 9 exact matches, 1 partial, 1 ambiguous, 1 unpaid,
  12 invoices, 11 payments, and 9 active allocations.
- A browser walkthrough over HTTPS reached the workbench, Partial tab, and INV-010 evidence screen.
- Caddy obtained a Let's Encrypt certificate and both ports 80/443 are listening.

The hostname is a free `sslip.io` pointer, not an owner-controlled custom domain. No custom DNS was
configured. `APP_URL` is set to the HTTPS origin so session cookies are Secure. The VM build ran out
of memory; the successful local `.next` production build was uploaded while Linux dependencies (incl.
`better-sqlite3`) were installed on the VM.

## Not verified here

- **Privy production-origin OTP**: email login succeeded against `http://localhost:3000`. The live
  HTTPS origin still must be added in the Privy dashboard and tested there.
- **Real AI provider**: no `AI_API_KEY` / `AI_MODEL`. Only the local mock provider is tested.
- **Custom domain**: only a free `sslip.io` hostname is configured; no owner-controlled DNS domain.
- **Standalone Linux build**: not executed.
- **Formal accessibility audit / WCAG certification**: not performed.
- **Long-running load, backup restore, or production memory profiling**: not performed.

## Reproduce

```bash
corepack enable
pnpm install
cp .env.example .env.local   # set SESSION_SECRET
pnpm migrate
pnpm dev                     # or pnpm dev:web + pnpm dev:worker in two terminals
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e                # after the built app and worker are available
```

