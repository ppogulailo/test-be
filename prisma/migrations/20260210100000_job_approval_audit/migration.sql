-- Add job approval audit fields (Non-negotiable)

ALTER TABLE "Job"
  ADD COLUMN "approvalRequestedAt" TIMESTAMP(3),
  ADD COLUMN "approvalRequestedById" INTEGER,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" INTEGER,
  ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_approvalRequestedById_fkey"
    FOREIGN KEY ("approvalRequestedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_rejectedById_fkey"
    FOREIGN KEY ("rejectedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Job_approvalRequestedAt_idx" ON "Job"("approvalRequestedAt");
CREATE INDEX "Job_approvedAt_idx" ON "Job"("approvedAt");
CREATE INDEX "Job_rejectedAt_idx" ON "Job"("rejectedAt");

