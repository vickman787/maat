# Submission fixes — 8 November 2026

The original findings are preserved in ../BUILD_SPEC_AUDIT.md. This is the remediation record.

## Implemented

- Single-worker startup recovers recently interrupted jobs immediately, with existing bounded retry accounting.
- Malformed thousands separators are rejected before minor-unit conversion.
- Manually settled invoices are distinct from exact-reference rule matches in totals, filters and reports.
- Original invoice/payment CSV values are visible during review; authenticated original-file downloads enforce workspace ownership.
- Manual payment selection searches every eligible payment and displays the selected payment’s original evidence. Previously allocated overpayment remainders remain visible but cannot be reused.
- Every pending exception is processed by the explanation stage; tied/duplicate candidates send up to three actual candidate rows.
- Fuzzy matching uses bounded indexed candidate buckets rather than a per-invoice all-payments scan.
- Retry/rerun synchronizes client job state with server refreshes and displays request failures.
- Demo visitors can reach email sign-in without first exiting the demo.
- Production sessions are bounded by the verified Privy token expiration, preserve that expiration during onboarding, and reverify the current stored access token for private requests. Old session-cookie versions expire on upgrade.
- The owner subsequently requested removal of the entire public demo feature. Guest demo endpoints, sample downloads and automatic sample seeding are removed; test fixtures live under tests only.
- Lint resolves plugins relative to eslint-config-next for pnpm layouts; react-hooks is an explicit locked development dependency.
- The stale login heading assertion is corrected; browser checks now cover cross-workspace status, retry, rerun, deletion, all export types and original downloads.
- Added targeted regression coverage including simultaneous confirmations from two independent Node processes.
- Deployment excludes temporary build backups and takes a database backup before running migrations.

## Verification recorded so far

- Complete final unit/integration suite: 57 tests passed in 10 files, including separate-process concurrency.
- TypeScript: passed in the final production build, including token freshness and corrected job endpoint authorization.
- ESLint: passed independently and in the final production build.
- Production build: PASS. An optional, unused Privy Farcaster/Solana dependency produces a warning; email-only login and wallets-off configuration were browser-tested.
- Browser acceptance: all six checks passed across two runs. The expanded access test first caught a 409 classification on retry/rerun; both endpoints now check scoped batch ownership first and return 404. The corrected upload/access, validation and responsive checks passed on rerun.
- Database backup command: repaired its CommonJS/top-level-await startup issue and passed against an isolated database.
- Public deployment: approved by the owner and completed successfully on 8 November 2026. Database migrations completed, both maat-web and maat-worker are active, and the local health endpoint reports database OK. Backup: /opt/maat/data/backups/2026-11-08T21-15-55-766Z. Code rollback archive: /opt/maat-rollback-20261108T211554Z.tgz.
- Public smoke test: passed against https://199-247-1-174.sslip.io, covering canonical demo matching, original evidence, authenticated source downloads and unauthenticated denial, partial confirmation, the $14,500 report, unallocated CSV, undo and demo-to-sign-in navigation. The first smoke attempt exposed a navigation timing issue in the test script; the corrected script waits for the Partial tab and selects INV-010 explicitly. Screenshot: docs/screenshots/09-public-fixed-review-1440.png.
- Real inference: passed locally and on the production server with Vultr Serverless Inference, model deepseek-v4.1-flash-1017, using the fictional partial-payment fixture. Private evidence: data/ai-verification.json. The initial 500-token response was incomplete; increasing the worker response allowance to 1600 produced valid schema-checked JSON and supplied-row citations. All seven AI regression checks passed after this change. The production worker adjustment and inference configuration are deployed; the public browser smoke check also confirmed the worker explanation appears with the Vultr provider label and advice-only notice, followed by successful confirmation, export and undo.

## Final account-only release

The owner requested a responsive desktop/mobile layout, guest Sign in / member Open dashboard homepage actions, and removal of all public demo data. The final production build passed, including lint and TypeScript. Legacy data cleanup was verified against an isolated database: the demo workspace and its files were removed while a private workspace and imported batch remained intact. Production inspection found 11 demo workspaces and no personal workspaces. All 57 regression tests passed after moving fixtures out of production modules. All six final browser acceptance tests passed in one run, including authenticated private upload/review/export/undo, cross-workspace denial and layouts from 320 to 1920 pixels. The final release is deployed and both services are healthy. Cleanup removed 11 legacy demo workspaces and 22 source files; the newly created personal account was preserved. The public smoke check passed all six viewport widths, guest sign-in and workflow navigation, authentication on the private dashboard, and 404 responses for removed guest-demo endpoints and public sample files. Backup: /opt/maat/data/backups/2026-11-08T22-03-32-754Z; rollback: /opt/maat-rollback-20261108T220332Z.tgz. A real production email sign-in reached the authenticated dashboard in the recording browser. GitHub push is the next release step.

## External completion steps

- Local and production inference configuration and real-provider verification are complete. The owner explicitly approved the secret transfer to 199.247.1.174; temporary transfer files were removed and secret values were withheld from logs.
- Production OTP still needs an actual sign-in on the final origin. The public demo does not require Privy login.
- Existing SSH key and live systemd services were found and verified. Both live services are active with inference configured.
- The current sslip.io hostname is temporary. The owner selected a 2:30 video; recording, licensing decision and LabLab submission remain submission tasks.
