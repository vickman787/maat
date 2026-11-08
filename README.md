# Ma'at

Ma'at reconciles invoice and payment CSVs in a private, signed-in workspace. Exact reference, currency and amount matches are allocated by deterministic rules. Exceptions retain their source evidence for human review; AI explains them without changing financial totals.

Live app: https://199-247-1-174.sslip.io
Repository: https://github.com/vickman787/maat

## Account and data behavior

Visitors sign in with a Privy email code. After naming their business, users start with an empty workspace. Returning members open their dashboard from the homepage. There is no public demo, automatic sample seeding or fictional dashboard balance. Each workspace shows only its own uploaded records.

The desktop interface uses side-by-side evidence and review panels where space permits; smaller screens use stacked panels and invoice cards.

## Features

- Two CSV uploads, column mapping, row-level validation, currency consistency and integer minor-unit arithmetic.
- Durable background matching with startup recovery and bounded retries.
- Exact matches, partial payments, ambiguous candidates and unresolved balances.
- Original CSV values and authenticated original-file downloads.
- Human confirmation, alternate payment selection, rejection, unresolved decisions and auditable reversal.
- Reports and CSV exports including unresolved invoices and unallocated payments.
- Real Vultr Serverless Inference explanations, labelled as advice with source-row citations. Formatted currency values prevent minor-unit confusion. Rules remain available during provider failures.
- Server-verified Privy sessions and workspace-scoped data access.

## Vultr architecture

The live backend and web app run on the Vultr VM at 199.247.1.174. Caddy terminates HTTPS and forwards requests to a Next.js process. A separate systemd-managed Node worker polls durable jobs in SQLite. Uploaded CSVs are private files scoped to a workspace. The worker performs deterministic matching, then sends only bounded exception bundles to Vultr Serverless Inference. Human review is required for uncertain allocations.

Browser → Caddy HTTPS → Next.js web/API → SQLite and private CSV storage → durable job queue → matching worker → Vultr Serverless Inference → human review → transactional allocations and CSV/report exports.

Privy provides email authentication, and tokens are verified by the server. The inference model is deepseek-v4.1-flash-1017. The model explains supplied evidence; it cannot write allocations or change totals. Service health checks, backups and rollback archives protect releases. This is one VM with separate web/worker processes, not a distributed cluster.

## Run locally

Requires Node.js 22+ and pnpm. Install dependencies with pnpm install. Configure .env.local using .env.example, including Privy identity settings, APP_URL, SESSION_SECRET, DATABASE_URL and UPLOAD_DIR. Inference uses AI_BASE_URL, AI_API_KEY and AI_MODEL; keep secrets out of Git.

Run pnpm migrate, then pnpm dev. Production: pnpm build, then pnpm start and pnpm worker:prod in separate processes.

Useful checks: pnpm test, pnpm lint, pnpm typecheck and pnpm test:e2e. pnpm verify:ai uses a fictional isolated exception to verify the configured provider and writes private evidence under data/.

## Verification and release

See FIXES_AND_VERIFICATION.md for results and remaining external acceptance steps. Production uses an existing Linux VM, SQLite, private uploads, and separate web/worker systemd services. Deployment takes a database/upload backup and a rollback archive before changing the running release.

Regression fixtures live under tests/fixtures and are never automatically loaded into an application account. scripts/clear-demo-data.ts removes legacy public-demo workspaces and explicit E2E identities after a backup. It leaves personal accounts and their uploads intact.

## Video

DEMO_VIDEO_PLAN.md prepares the owner-selected 2 minute 30 second walkthrough. Recording uses a dedicated signed-in workspace and intentionally uploaded demonstration files. No public guest demo is required.

## License

MIT, copyright 2026 vickman787. See LICENSE. Third-party dependencies retain their respective licenses.
