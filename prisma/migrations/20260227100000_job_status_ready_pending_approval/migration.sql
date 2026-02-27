-- Rebuild enum to avoid PostgreSQL 55P04 ("unsafe use of new value")
-- when trying to use newly added enum values in the same transaction.
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";

CREATE TYPE "JobStatus" AS ENUM (
  'DRAFT',
  'LIVE',
  'READY',
  'PENDING_APPROVAL',
  'ARCHIVED',
  'HIDDEN'
);

ALTER TABLE "Job" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Job"
ALTER COLUMN "status" TYPE "JobStatus"
USING (
  CASE "status"::text
    WHEN 'APPROVED' THEN 'READY'
    WHEN 'APPROVAL_PENDING' THEN 'PENDING_APPROVAL'
    WHEN 'REJECTED' THEN 'ARCHIVED'
    WHEN 'EXPIRED' THEN 'ARCHIVED'
    ELSE "status"::text
  END
)::"JobStatus";

DROP TYPE "JobStatus_old";

ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
