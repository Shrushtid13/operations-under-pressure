# Database Backup & Restore Drill Report

**Procedure:** Logical dump and verification per architecture §11.4  
**Date:** 2026-10-18  
**Operator:** Automated System Verification  
**Database:** PostgreSQL 16 Alpine (`operations_db`)  

---

## 1. Source Database Verification

- **Role:** `app_backup` (read-only member of `pg_read_all_data`)
- **Command:** `npm run backup`
- **Output:**
  - File: `backups/operations-backup-2026-10-18T10-06-45-609Z.dump`
  - Size: 44,277 bytes
  - SHA-256 Checksum: `30d6dce87074355e51f52083db7ed04bf07439a04e3d93a1f32908e6c5fc67d7`

---

## 2. Restore Drill Execution

1. Checksum verification:
   - Checksum matches dump file SHA-256 precisely (`30d6dce...`).
2. Schema & Grants Survival:
   - Custom format dump retains object definitions, foreign key constraints, composite foreign keys, partial unique indexes, and table grants.
   - Database roles (`app_migrator`, `app_runtime`, `app_backup`) are cluster-level roles initialized by `db/init/01-roles.sql`.
3. Invariant Verification:
   - Full-history invariant returns 0 rows.
   - Composite foreign keys between `work_items(team_id, assignee_id)` and `team_memberships(team_id, user_id)` are intact.
   - Outbox rows link validly to audit events.

---

## 3. Post-Restore Security Procedure

In production or emergency recovery, execute:
```sql
UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;
```
This forces all users to authenticate again with their password, preventing sessions revoked after the snapshot timestamp from remaining active.

---

## 4. Assessment Status
- **Drill Status:** **VERIFIED**
- **Logical Dump:** Implemented (`npm run backup`)
- **Restoration Test:** Verified against test database
- **Integrity Validation:** 100% compliant with schema invariants
