# Demo script (target 2–3 minutes)

Check the live LabLab submission form for the current video limit and slide requirements. Do not
infer a deadline from a date alone.

## 0. Before recording

- Use a clean demo workspace; click **Reset demo** if needed.
- Keep the browser at 1440×900 for the main walkthrough, then show one phone-width frame.
- If an AI provider is configured, confirm the review screen shows real provider/model metadata.
  If it is not configured, say so explicitly and show the rule-based fallback. Do not imply a model
  responded when it did not.

## 1. The problem (15s)

Open the landing page.

> “Small teams can export invoices and payments, but matching them still ends in a spreadsheet and a
> guess. Ma'at matches the facts, explains the exceptions, and keeps a traceable human decision.”

## 2. The sample batch (20s)

Click **Explore demo**.

Point out:

- USD 18,000 invoiced across 12 invoices
- USD 16,500 imported across 11 payments
- USD 13,500 confirmed across nine exact matches
- Three invoices need attention

> “This is a disposable sample workspace. Personal uploads are disabled. Nothing here moves money.”

## 3. Workbench and evidence (35s)

Click **Review exceptions**. Show the tabs and counts. Open **INV-010**.

> “Orbit Creative paid USD 1,000 against a USD 1,500 invoice. The reference and currency agree, so it
> is a partial candidate—but the money difference is real and needs a human.”

Show the original invoice row, the candidate payment row, filenames, row numbers, the USD 500
outstanding difference, and the rule reason.

If AI is configured, read the explanation and point out the evidence row IDs and provider/model. If
not, say: “AI is not configured in this run, so Ma'at is showing rule-based evidence only.”

## 4. Human decision and audit (30s)

Tick **I reviewed both source rows**, add a short note if desired, and click **Save confirmed
allocation**.

> “USD 1,000 is assigned. USD 500 remains outstanding. The decision is appended with reviewer and
> timestamp; the source rows are untouched.”

Return to the workbench:

> “Confirmed allocations are now USD 14,500. One payment remains unallocated: P011, USD 2,000. INV-011
> is still unpaid and INV-012 is still ambiguous. We do not hide either one.”

Open **Undo**, confirm, and show the reversal event.

> “Undo never erases history. It adds a reversal, and totals recompute.”

## 5. Export (25s)

Open **Export report**.

- Show confirmed USD 13,500 after undo, outstanding USD 4,500, and the unresolved note naming
  INV-011, INV-012, P010, P011.
- Download the reconciliation CSV and show the same confirmed/outstanding values.
- Click **Print / Save as PDF** to show the printable report.

## 6. Real upload (optional, 20s if configured)

Sign in with email, name the business, upload the two sample CSVs, and show column mapping and
row-level validation. If email OTP is not available on camera, skip this segment rather than faking
login.

## 7. Architecture close (20s)

Show [ARCHITECTURE.md](ARCHITECTURE.md) or a slide with:

- Browser → HTTPS Caddy → Next.js on Vultr → SQLite + private uploads
- Durable job table → one worker → deterministic matching → optional AI explanation
- Privy identity verified server-side; workspace-scoped every record
- AI cannot compute totals, mutate allocations, or send money

> “Rules do the arithmetic. AI explains. Humans decide. The export shows what is still unresolved.”

If deployed, show the real public HTTPS URL and health check. If not deployed, say deployment is
prepared but not complete. Do not claim a public URL that has not been verified.
