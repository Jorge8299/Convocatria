# Multi-club, phase 1

`clubs` owns the club identity (one primary colour). The first record is `ud-oliva`.
`club_accounts.club_id` is required except for the global `superadmin` role, where it is null.
`club_stores.club_id` has a composite foreign key to its owning account. Existing JSON documents remain in their current areas; entities inside them receive `club_id`. No IDs, PIN hashes, positions, results or roster entries are replaced.

The store trigger assigns the account's club, rejects conflicting document metadata, foreign player owners, copied foreign player IDs and foreign player references. Teams, players, rivals, agendas, matches, training sessions, callups, statistics and tactical boards inherit this boundary. Sessions and push subscriptions remain owned by their account; login attempts and platform audit remain global infrastructure. `club_fields` scopes the existing three home fields and their zone IDs to Oliva.

Authenticated bootstrap queries, account administration, coordinator changes and calendar imports enforce the current club. Superadmin can inspect every club through the existing account impersonation. The public active-user directory remains available for the unchanged name/PIN login; it does not expose stores or PINs.

The superadmin's Clubs section edits only name, logo and primary colour. Add club is deliberately disabled in this phase. Adding a second club later requires enabling creation and a club selector in global account creation; the API already accepts `club_id` on account creation. Existing roles and training-development protection are unchanged.

## Migration and verification

`api/_lib/clubs.ts` contains migration `multi-club-v1`. On Neon it batches all statements into one transaction, guarded by an advisory lock and a migration marker. Successful subsequent calls only check the marker. The migration is additive; rollback of application code must keep the club-aware account inserts, because the database now enforces club ownership.

Run `node --import tsx --test tests/clubs.test.ts` for PostgreSQL isolation and migration regression tests. `scripts/verify-club-migration.ts` reads production but migrates only an isolated in-memory PostgreSQL copy; it compares all payloads and credentials before/after. `scripts/audit-clubs.ts --baseline` records only aggregate hashes and counts in ignored `.vercel`; the command without that argument verifies the deployed data against that baseline.

## Existing branding

Authenticated coach identity and shared role-header crest read the current club. The existing team name is preserved rather than overwritten at load. Calendar extraction excludes the current club instead of always excluding Oliva. Home-field validation reads `club_fields`.

The unchanged login artwork, static PWA metadata, PDF templates, Oliva field photographs/polygons and the existing blue UI palette remain legacy presentation assets for this phase; they are not used as authorization boundaries. Their full per-club customization is outside this phase. Field creation/layout and broader branding can be added alongside second-club onboarding without changing stored team/account IDs.
