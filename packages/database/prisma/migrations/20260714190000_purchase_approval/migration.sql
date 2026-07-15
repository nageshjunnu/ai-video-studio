ALTER TABLE "Purchase"
  ADD COLUMN "transactionId" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "notes" TEXT;

CREATE UNIQUE INDEX "Purchase_transactionId_key" ON "Purchase"("transactionId");
