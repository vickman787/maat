> Current release: the owner requested an account-only app. The public demo, automatic samples and guest demo routes have been removed. Real Vultr inference and production email sign-in are verified. See README.md and FIXES_AND_VERIFICATION.md for current behavior; older demo-related descriptions below are historical.

# Known limitations and untested items

Ma'at is an MVP. This file is intentionally conservative; do not convert any item below into a
completion claim in a submission.

## Environment-limited, not verified end-to-end here

1. **Privy production-origin login.** A real email OTP login and business setup succeeded against
   `http://localhost:3000`, producing one verified Privy DID and owner workspace. The production HTTPS
   origin still must be added to the Privy dashboard and tested after deployment. Wallets stay off.

2. **Privy identity-token email display.**
   If identity tokens are not enabled in Privy, the app stores and displays the verified Privy DID
   rather than an email address. This is expected and is shown honestly in Settings.

3. **Real AI provider inference.**
   The AI client, schema validation, evidence allowlist, caching, retry, fallback, and job
   integration are implemented and tested against a local mock OpenAI-compatible server (success,
   invalid evidence, HTTP failure, unconfigured). No real `AI_API_KEY` or `AI_MODEL` was available, so
   no real provider response is claimed. Real-provider success and cost/latency behaviour must be
   verified before claiming the AI integration complete.

4. **Vultr deployment and hostname.** The app is deployed on the reported VM and verified over HTTPS at
   `https://199-247-1-174.sslip.io`. That is a free `sslip.io` pointer, not an owner-controlled custom
   domain. The live origin must still be added to the Privy dashboard and login tested there.

## Product scope limits

- **One currency per batch.** USD only in this MVP. Mixed currencies and FX are rejected, never
  converted.
- **No bank connections or money movement.** Confirmed matches are accounting classifications.
- **No OCR/PDF ingestion, accounting-system integrations, automatic collection emails, billing, team
  invitations, multi-workspace switching, or arbitrary agent code execution.**
- **One owner workspace per user.** Repeated sign-ins do not create duplicates; there is no
  multi-workspace selector.
- **A payment can be allocated to at most one invoice.** Multiple payments may settle one invoice via
  explicit review. Overpayment remainders stay visible and unallocated.
- **Undo is a reversal event**, not a deletion. It restores the item to review where appropriate.
- **Search is substring-based** over invoice/payment IDs, names, and references. No fuzzy search.
- **Pagination** is 10 rows per page; there is no saved-view or bulk-action feature.
- **No server-generated PDF file.** The report is print-friendly HTML; use the browser's Save-as-PDF.
- **No formal accessibility audit.** The UI has keyboard focus styles, labels, 44px primary controls,
  semantic tables/tabs, mobile card alternatives, and reduced-motion handling, but no WCAG
  certification is claimed.
- **No regulatory certification or guaranteed matching accuracy.**
- **Demo data is fictional.** It is isolated per visitor, labelled, upload-locked, rate-limited, and
  expires after 24 hours. Reset affects only the current visitor.
- **Deletion is permanent.** Batch deletion removes private source files and linked rows/events/
  reports. There is no recycle bin.
- **Single-node worker.** One worker process with concurrency 1 is intentional for 1 vCPU / 1 GB.
  There is no distributed queue or horizontal worker scale-out.
- **Rate limiting** is database-backed per hourly window and hashed IP for demo creation; it is not a
  general WAF or bot-protection system.
- **CSV formula escaping** prefixes risky cells with an apostrophe. Spreadsheet tools may display that
  apostrophe; the alternative is formula execution, so safety wins.
- **Source-value retention:** original row objects are stored alongside normalized fields. Raw rows
  are never logged by the application, but operators with database access can read them.

## Operational cautions

- Build on Linux or CI for Linux. Do not copy Windows `better-sqlite3` binaries to the VM.
- Add swap if building on a 1 GB VM.
- Keep `data/`, `.env`, and `.env.local` out of source control and public web paths.
- Rotate `SESSION_SECRET` only as a planned operation; existing sessions become invalid.
- If AI is enabled, uploaded exception text is processed by the configured external provider. The
  upload screen explains this. Do not enable a provider whose terms are unacceptable for the data.
