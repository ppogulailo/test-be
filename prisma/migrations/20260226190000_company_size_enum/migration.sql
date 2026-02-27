-- CreateEnum: new CompanySize values (1-10, 11-50, 51-200, 201-500, 500+)
CREATE TYPE "CompanySize_new" AS ENUM ('1-10', '11-50', '51-200', '201-500', '500+');

-- AlterTable companies: map old size to new enum
ALTER TABLE "companies" ALTER COLUMN "size" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "size" TYPE "CompanySize_new" USING (
  CASE "size"::text
    WHEN '1-50' THEN '11-50'::"CompanySize_new"
    WHEN '51-100' THEN '51-200'::"CompanySize_new"
    WHEN '101-500' THEN '201-500'::"CompanySize_new"
    WHEN '501-1000' THEN '500+'::"CompanySize_new"
    WHEN '1001-5000' THEN '500+'::"CompanySize_new"
    WHEN '5001-10000' THEN '500+'::"CompanySize_new"
    WHEN '10001-50000' THEN '500+'::"CompanySize_new"
    WHEN '50001-100000' THEN '500+'::"CompanySize_new"
    ELSE '1-10'::"CompanySize_new"
  END
);
ALTER TABLE "companies" ALTER COLUMN "size" SET DEFAULT '1-10'::"CompanySize_new";

-- AlterTable Job: map old companySize to new enum
ALTER TABLE "Job" ALTER COLUMN "companySize" TYPE "CompanySize_new" USING (
  CASE "companySize"::text
    WHEN '1-50' THEN '11-50'::"CompanySize_new"
    WHEN '51-100' THEN '51-200'::"CompanySize_new"
    WHEN '101-500' THEN '201-500'::"CompanySize_new"
    WHEN '501-1000' THEN '500+'::"CompanySize_new"
    WHEN '1001-5000' THEN '500+'::"CompanySize_new"
    WHEN '5001-10000' THEN '500+'::"CompanySize_new"
    WHEN '10001-50000' THEN '500+'::"CompanySize_new"
    WHEN '50001-100000' THEN '500+'::"CompanySize_new"
    ELSE NULL
  END
);

-- Drop old enum and rename new
DROP TYPE "CompanySize";
ALTER TYPE "CompanySize_new" RENAME TO "CompanySize";
