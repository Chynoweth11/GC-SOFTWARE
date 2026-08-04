-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "entityLabel" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userEmail" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userRole" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_companyId_userId_idx" ON "AuditLog"("companyId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

-- The audit history is permanent.
--
-- Rejecting UPDATE and DELETE at the database level rather than in application
-- code means the guarantee holds no matter how the table is reached: through the
-- app, through a script, through a migration, or through a database console.
-- Inserts are unaffected, so the log keeps growing and never changes.
CREATE TRIGGER audit_log_is_append_only_update
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'The audit history is permanent and cannot be modified.');
END;

CREATE TRIGGER audit_log_is_append_only_delete
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'The audit history is permanent and cannot be deleted.');
END;
