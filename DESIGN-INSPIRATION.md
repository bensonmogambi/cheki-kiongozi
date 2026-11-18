# Civic-tech patterns informing Cheki Kiongozi

Cheki Kiongozi borrows interaction and data-governance patterns, not another country's offices, legal rules or scoring model.

## U.S. reference patterns

- [USAspending.gov](https://www.usaspending.gov/) shows how spending data can be browsed by fiscal year, agency, award, recipient and location, with downloadable data, a glossary and source disclosures. Cheki Kiongozi adapts the discoverability, provenance and data-dictionary ideas for Kenya's Treasury, Controller of Budget, Auditor-General, NG-CDF Board and procurement sources. U.S. federal award categories are not treated as Kenyan budget categories.
- [SeeClickFix / Open311 API](https://dev.seeclickfix.com/v2/recommendations/) demonstrates location-aware issue reporting and a public issue API. Cheki Kiongozi adapts location, status and follow-up patterns to project issues. A civic report remains a resident report until a qualified verifier checks it; user identity is not exposed to the public.
- [GovTrack.us](https://substack.govtrack.us/about) publishes U.S. legislative status and voting-record information. Cheki Kiongozi adapts the simple leader profile and source-linked activity timeline. Kenyan office responsibilities, official records and public scoring methods remain Kenya-specific.

## Product rules carried into the implementation

- Every published money figure must include the source URL and page, table or section; source terms must be reviewed.
- Preserve raw official categories and distinguish reported items from official-source records.
- People’s Grade and Evidence Grade remain separate. No combined headline grade is enabled.
- Never infer money lost to corruption from a difference or gap.
- Export only published source-backed records and threshold-qualified aggregates. Never export voter IDs, phone numbers, identity hashes, raw grades or private comments.
- Changes to ratings, reports, accounts and publication states are recorded in the admin audit log.

## Kenyan adaptation and items not copied

Cheki Kiongozi covers Governor, Senator, Woman Representative, MP, MCA and county/constituency delivery officials. It uses Kenya's July-to-June financial year and Kenyan sources. U.S. campaign-finance rules, congressional committees, district boundaries, federal awards, party scorecards and legal protections do not transfer automatically. Each source's terms, provenance and reuse permissions must be checked before ingestion or sale.
