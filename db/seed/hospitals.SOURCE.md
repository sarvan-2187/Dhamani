# hospitals.csv provenance

- Source: Blood Bank Directory (updated till last month), Government of India, Open Government Data Platform: https://www.data.gov.in/resource/blood-bank-directory-updated-till-last-month
- API resource: fced6df9-a360-4e08-8ca0-f283fc74ce15. Licence: Government Open Data License - India.
- Fetched: 2026-11-09 by `npm run db:import-hospitals` (2823 records nationally).
- States: Andhra Pradesh, Telangana, Tamil Nadu, Kerala, Karnataka. Plus 3 DEV ONLY demo rows (A and B in Chennai, C in Madhurawada, Visakhapatnam), kept for testing.

| State | In source | Imported | Skipped: bad or missing coordinates | Skipped: duplicate name + city | Skipped: missing name/city/address |
| --- | --- | --- | --- | --- | --- |
| Andhra Pradesh | 139 | 112 | 27 | 0 | 0 |
| Karnataka | 198 | 190 | 6 | 2 | 0 |
| Kerala | 179 | 175 | 4 | 0 | 0 |
| Tamil Nadu | 291 | 224 | 67 | 0 | 0 |
| Telangana | 149 | 115 | 34 | 0 | 0 |

Rules: only fields present in the source are used. `has_apheresis` is true only where the source says "yes"
(2 records had an unclear value and are false). `eraktkosh_url` is empty: the directory has no link.
Phone numbers, emails and nodal officer names are not imported.

Caution: the newest licence renewal date in these states is from 2022, so details may be out of date.
A coordinator should confirm a blood centre by phone before relying on it.
