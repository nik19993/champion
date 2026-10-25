# Curriculum redistribution 25 October 2026

This release implements the owner-approved age allocation. Deliberate heading
and first-ball learning tasks start at U14. More complex first-contact decisions,
contested aerial play, and targeted corner/free-kick deliveries move to U15.
Four accessible goals move from U14 to U13. The program still has 349 tasks
(284 field and 65 goalkeeper); U13 and U14 each have 26 tasks, U15 has 29.

## Age changes

Stable catalog positions refer to `sort_order`, retained for existing imports.

| Positions | New category |
| --- | --- |
| 104, 131, 132, 158 | U14 |
| 160, 189, 198, 199, 202 | U15 |
| 213, 214, 222, 236 | U13 |

Low crosses, no-heading layoffs and goalkeeper high-ball catches remain in
their existing age programs, with the agreed conditions clarified. The general
program guidance covers individual physical readiness and fatigue. No lighter-ball
instruction or separate U15 technique progression has been added.

## Deployment

1. Verify the production alias `champion-snowy-mu.vercel.app` and its Supabase
   project `dlbombpmemdgkimbkuct` before running any write.
2. Run unit tests, lint, typecheck and build. Run the isolated redistribution SQL
   test with PGlite, including idempotency, history preservation and drift rollback.
3. Execute `redistribute_curriculum.sql` once using the authorized database
   connection. It is a guarded, atomic update of 18 existing records. A mismatch
   aborts the entire transaction. It may be rerun safely when already applied.
4. Verify all 349 active tasks against the versioned seed. Check the unchanged
   task UUIDs, archived tasks, events, material links and migration ledger.
5. Deploy the exact reviewed Git commit to the existing Vercel production project.
   Verify READY status, alias, program guidance, and the downloadable Word checksum.

This is not a schema migration. Do not run `supabase db push`, change the migration
ledger, delete or reimport the catalog, or apply the historical transient-schedule
cleanup migration. No user, Auth, player, attendance, or Storage records are changed.

The seed retains its established filename `approved_curriculum_20261024.json`;
its current contents and checksum are recorded in this release manifest.
The current editable training document is
`public/materials/Champion_Learning_Tasks_20261025.docx`.
