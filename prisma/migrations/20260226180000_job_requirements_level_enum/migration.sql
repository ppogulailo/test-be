-- CreateEnum
CREATE TYPE "RequirementsLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable Job: responsibilities TEXT[] -> TEXT (nullable)
ALTER TABLE "Job" ALTER COLUMN "responsibilities" TYPE TEXT USING (
  CASE
    WHEN "responsibilities" IS NULL OR array_length("responsibilities", 1) IS NULL THEN NULL
    ELSE array_to_string("responsibilities", E'\n')
  END
);

-- AlterTable Job: requirements TEXT[] -> RequirementsLevel (nullable)
ALTER TABLE "Job" ADD COLUMN "requirements_new" "RequirementsLevel";
ALTER TABLE "Job" DROP COLUMN "requirements";
ALTER TABLE "Job" RENAME COLUMN "requirements_new" TO "requirements";

-- AlterTable Job: perks TEXT[] -> TEXT (nullable)
ALTER TABLE "Job" ALTER COLUMN "perks" TYPE TEXT USING (
  CASE
    WHEN "perks" IS NULL OR array_length("perks", 1) IS NULL THEN NULL
    ELSE array_to_string("perks", E'\n')
  END
);
