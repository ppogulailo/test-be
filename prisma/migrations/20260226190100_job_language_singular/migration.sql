-- Job.languages (array) -> Job.language (single optional)
-- Add new column, migrate first element of array, drop old column
ALTER TABLE "Job" ADD COLUMN "language" "JobLanguage";

UPDATE "Job"
SET "language" = "languages"[1]
WHERE array_length("languages", 1) > 0;

ALTER TABLE "Job" ALTER COLUMN "language" DROP NOT NULL;
ALTER TABLE "Job" DROP COLUMN "languages";
