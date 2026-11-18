# Cheki Kiongozi

Cheki Kiongozi is a civic scorecard for Kenyan leaders. It keeps the People’s Grade separate from sourced public records and the proposed Evidence Grade. The working MVP includes a public voter flow, private admin review and data collection, a separate results workspace, printable scorecards, source-linked exports, persistent records and admin backups.

## Run the local demonstration

Install Node.js 20 or later, then run:

```powershell
npm run demo
```

Open the local address printed in the terminal (normally `http://127.0.0.1:4173`). The demo creates its own `data-demo` store and does not change `data/scorecard.json`. On first start, use the one-time setup link printed in the terminal to create the administrator.

Demo voter flow: enter any **test-only** 6–12 digit ID and a test phone number, accept the consent checkbox, then use the OTP shown on screen (`000000` by default). This is a simulation: it checks no identity database, sends no SMS, and verifies no real person. Use test data only. Demo mode is locked to localhost and refuses to start in production.

## End-to-end workflow

1. **Admin:** sign in, set the publication threshold and grade bands, review submitted ratings, count or exclude them, enter sourced money/audit/project/promise/reply records, then publish records after checking the source and reuse terms.
2. **Voter:** open `/vote` without an account, complete the configured identity check, grade a leader from 1–10, and see the private review state.
3. **Public results:** anyone can open `/results` and any leader scorecard without signing in. Only admin-published records and reviewed, threshold-qualified aggregate grades appear; private submissions stay hidden.
4. **Super Data:** filter records and download the public CSV. Admins can also download a private full backup. Keep private backups restricted; they contain account and voter records.

Admin data and decisions, ratings and results share the same persistent JSON store in `data/` (or `SCORECARD_DATA_DIR`). Each update preserves the prior version as `scorecard.json.bak`; copy backups to a restricted, separate location regularly. To start the non-demo app, run `npm start`. The first start prints an admin setup link. Sessions end when the server restarts.

## Before a real voter pilot

The simulated voter check is only for walkthroughs. A real pilot needs an authorized Kenyan identity-check provider, its OTP delivery, the required privacy review and provider credentials. Configure the server variables documented in [IDENTITY-VERIFICATION.md](IDENTITY-VERIFICATION.md); never turn on demo mode for real voters. The application does not connect directly to the National Registration Bureau.

The admin must publish the approved threshold and grade bands before public grades appear. Admin settings persist and are logged. The demo defaults are for testing only. Voter-declared county/ward is not an official eligibility check. Professional field verification, government data feeds, USSD/SMS access, payments, managed database hosting and legal/DPIA approval are not implemented integrations. Do not label reported project status as independently verified.

Public records require an HTTPS source, human review, reuse-terms clearance and a page/table locator for amounts. Four sample Njoro NG-CDF entries are loaded as private drafts, not proof of completed work; see [SAMPLE-DATA-SOURCES.md](SAMPLE-DATA-SOURCES.md). Planned AI features are optional resident-facing civic explainers and question guides; they do not process voter submissions, verify identities or calculate grades, and they are not active in this MVP. Never sell voter IDs, phone numbers, individual ratings, identity hashes or private comments. The intended data product is sourced public records and safe aggregates.

This is an operable local MVP for a supervised demonstration and workflow pilot. Before exposing it to the public internet, move to a managed database/session store, HTTPS deployment, managed secrets, account recovery, monitoring, tested restore procedures and a security/privacy review.
