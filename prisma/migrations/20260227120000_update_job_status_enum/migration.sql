-- Rebuild JobStatus enum: remove READY and HIDDEN, add APPROVED.
-- Migrate any existing rows that use removed values before dropping.
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";

CREATE TYPE "JobStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'LIVE',
  'ARCHIVED'
);

ALTER TABLE "Job" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Job"
ALTER COLUMN "status" TYPE "JobStatus"
USING (
  CASE "status"::text
    WHEN 'READY'  THEN 'DRAFT'
    WHEN 'HIDDEN' THEN 'ARCHIVED'
    ELSE "status"::text
  END
)::"JobStatus";

DROP TYPE "JobStatus_old";

ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
