# Cheki Kiongozi: brief-to-build map

This project uses the name **Cheki Kiongozi**. “Daraja” was the brief's working name. U.S. civic-data products inform browse, source-trail and location-reporting patterns; Kenya's offices, budget cycles, official records and legal rules govern the product. See [DESIGN-INSPIRATION.md](DESIGN-INSPIRATION.md).

## Available in this local prototype

- Voters need no account: `/vote` opens an accountless session and gates grading on provider verification. The administrator workspace and its APIs are protected. `/results` and `/scorecard` are public and expose only published source records and reviewed, threshold-qualified aggregates; private individual ratings remain inaccessible.
- The rating workflow is 1–10 across the seven stated categories, with the latest grade per verified identity, leader and July–June financial year replacing the earlier one. Publication is threshold-gated by office and counts one verified identity once. People’s Grade can show an A–E band only when valid bands are configured.
- Admin data collection and Super Data filters/CSV cover money, audit findings, projects, promises and replies. Public entries require an HTTPS source, source label, source/page locator for amounts, human source review and terms review. Auditor-General categories remain distinct. Promise states include Delivered, In progress, Not started and Broken.
- Results can show published records and a print/save-as-PDF leader scorecard. Results do not disclose voter identities or individual grades. Admin can review votes and publish source records; shared changes appear in the results workspace.
- The PWA shell is installable and caches public shell assets only. The public methodology endpoint and page disclose the current rules and provisional Evidence Grade proposal.
- Planned AI features are resident-facing explainers for civic roles and terms, general civic Q&A and Kiswahili-friendly guidance. They are separate from identity verification, voter submissions, evidence review and official score calculations; no AI service is integrated yet.

## Still required before a pilot or public launch

- **Identity and voter eligibility:** configure an authorized KYC/OTP provider, confirm provider terms and pricing, define the single ward rule, load official ward boundaries and enforce leader-area eligibility. The current pilot uses voter-declared area; the site does not connect directly to NRB. Do not collect real ID data until the provider and privacy review are ready.
- **Professional verification:** professional profiles and licence checks, assignments, ward rotation, conflict checks, geo/time-stamped evidence capture, photo metadata handling, two independent checks for “Not found,” and weather evidence. The current site does not verify professionals or ground truth; admin entries cannot claim otherwise.
- **Annual report generation:** Evidence Grade calculation, component provenance and data-availability notes, human report-card review, provisional/final publication states, historical versions, right-of-reply workflow and a public corrections log. The current People’s Grade and sourced records are separate; the Evidence Grade is not calculated.
- **Official data pipeline:** archived source documents/checksums, extraction and OCR, confidence scoring, reviewer queue, version history and approved source licences. Super Data is manual data entry today; no Kenyan government feed is connected.
- **Feature-phone and language access:** WhatsApp Business flow, USSD/SMS provider, OTP over those channels, English and Kiswahili content, low-data/offline form support and accessible account recovery. These need provider accounts and implementation; they are not active integrations.
- **Safety and reliability:** rate limits by account/device/IP, coordinated-vote anomaly review, comment/photo moderation and legal escalation, breach response, managed encrypted database/session store, backups, monitoring, dependency review and deployment security.
- **Data business:** research/open-data products can use public, sourced records and aggregate data. No billing or paid entitlement is implemented. Never sell voter identifiers, raw ballots, private comments or identifiable verification data; do not sell political placement or score influence.
- **Kenya launch readiness:** pilot county and leader roster, Kenyan privacy/DPIA and ODPC review, lawful processing/retention terms, source licensing, media/defamation and election-period review, hosting/data-residency decision, independence policy and legal entity ownership.

## Production architecture proposed by the brief

The current Node/JSON app is a local prototype. The brief's production target is a Django + Django REST Framework monolith, PostgreSQL/PostGIS, Celery/Redis for ingestion and report generation, a small React PWA, S3-compatible evidence storage, managed secrets, HTTPS, backups and monitoring. Migrate only after the pilot data model and retention policy are settled. Preserve the endpoint concepts in the brief for OTP, leaders, grades, projects, funds, promises, replies, report cards, methods and corrections.

## Non-negotiable display rules

- No invented figures. A published financial amount needs a source document and page/table/section.
- People’s Grade and Evidence Grade stay separate. No combined letter is enabled.
- Use “citizens’ rating,” “unsupported,” and the Auditor-General’s categories. A gap is not called theft or corruption.
- Keep grades private until review and the per-office minimum. Public outputs are aggregates only.
- Treat the scorecard as provisional until audited figures are available for the year. Every admin publication or status change is logged.
