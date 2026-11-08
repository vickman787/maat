# Submission checklist

Check the live LabLab form for current deadlines, eligibility, slide/video limits, and licensing.
Do not infer a closing hour from a date.

## Product

- [x] Working end-to-end reconciliation workflow implemented
- [x] Canonical fixture and financial invariants verified
- [x] Privy email-OTP UI and server-side JWKS verification implemented
- [x] Workspace isolation, cross-workspace denial tested
- [x] Isolated demo workspace, reset, rate limit, cleanup
- [x] Durable jobs, retry/recovery, idempotent allocation
- [x] Real AI explanation architecture with strict validation and labelled fallback
- [x] Human review, notes, undo reversal, append-only audit history
- [x] Three CSVs and print-friendly report
- [x] Responsive UI reviewed at 1440 / 768 / 390 with actual screenshots
- [x] Unit/integration tests and Playwright browser walkthroughs

## Deliverables

- [x] Source code (this `maat/` directory)
- [x] `pnpm-lock.yaml`
- [x] Migrations and migration runner
- [x] Downloadable sample CSVs
- [x] `.env.example`
- [x] README
- [x] architecture diagram/explanation (`ARCHITECTURE.md`)
- [x] known limitations (`KNOWN_LIMITATIONS.md`)
- [x] demo script (`DEMO_SCRIPT.md`)
- [x] verification record (`VERIFICATION.md`)
- [x] Vultr systemd/Caddy/deployment preparation (`DEPLOYMENT.md`, `deploy/`)
- [ ] Public repository created/published (not requested here; **not done**)
- [x] Public demo URL: https://199-247-1-174.sslip.io (HTTPS verified; temporary sslip.io hostname)
- [ ] Recorded demo video (script ready; **not recorded**)
- [ ] LabLab submission (not made)

## Remaining credentials and access

1. **Vultr VM**: deployment access is working with the dedicated key; app and worker are active.
   Remaining: add the live HTTPS origin in Privy and perform one production login.
2. **DNS / hostname**: an owner-controlled hostname with an A record to the VM, for HTTPS.
3. **Privy dashboard**: Email login is working on localhost and wallets are off. Still add the exact
   production HTTPS origin, then test login there. Optionally enable identity tokens for email display.
4. **AI provider (optional)**: working Vultr Serverless Inference access, API key, and a currently
   available model ID. Until supplied, AI explanations remain plainly unconfigured/rule-based.
5. **Mailbox**: a mailbox you control for the real Privy OTP acceptance test.

## Honest claims for submission

Use:

- “Deterministic reconciliation, human review, audit history, and exports are implemented and tested.”
- “Privy token verification is implemented; email delivery must be configured and tested on the final
  origin.”
- “The AI explanation layer is implemented with a labelled fallback; a real provider run must be
  captured before claiming it is live.”
- “Deployment configuration is prepared; the public URL will be added only after a verified deploy.”

Do not use:

- “Fully deployed / live AI / certified / guaranteed matching accuracy” unless actually verified.
- Any invented provider response, financial total, screenshot, or public URL.
