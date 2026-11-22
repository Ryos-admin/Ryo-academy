-- Exact payment-to-detail attribution. No historical rows are backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS "FeePayment_uq_payment_id_header"
  ON "FeePayment"("id", "feePaymentHeaderId");

CREATE UNIQUE INDEX IF NOT EXISTS "FeePaymentDetails_uq_detail_id_header"
  ON "FeePaymentDetails"("id", "feePaymentHeaderId");

CREATE TABLE "FeePaymentDetailAttribution" (
  "id" TEXT NOT NULL,
  "feePaymentId" TEXT NOT NULL,
  "feePaymentDetailsId" TEXT NOT NULL,
  "feePaymentHeaderId" TEXT NOT NULL,
  "amount" DECIMAL(65,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeePaymentDetailAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeePaymentDetailAttribution_feePaymentId_feePaymentDetailsId_key"
  ON "FeePaymentDetailAttribution"("feePaymentId", "feePaymentDetailsId");
CREATE INDEX "FeePaymentDetailAttribution_feePaymentId_idx"
  ON "FeePaymentDetailAttribution"("feePaymentId");
CREATE INDEX "FeePaymentDetailAttribution_feePaymentDetailsId_idx"
  ON "FeePaymentDetailAttribution"("feePaymentDetailsId");
CREATE INDEX "FeePaymentDetailAttribution_feePaymentHeaderId_idx"
  ON "FeePaymentDetailAttribution"("feePaymentHeaderId");

ALTER TABLE "FeePaymentDetailAttribution"
  ADD CONSTRAINT "FeePaymentDetailAttribution_payment_header_fkey"
  FOREIGN KEY ("feePaymentId", "feePaymentHeaderId")
  REFERENCES "FeePayment"("id", "feePaymentHeaderId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FeePaymentDetailAttribution_detail_header_fkey"
  FOREIGN KEY ("feePaymentDetailsId", "feePaymentHeaderId")
  REFERENCES "FeePaymentDetails"("id", "feePaymentHeaderId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FeePaymentDetailAttribution_header_fkey"
  FOREIGN KEY ("feePaymentHeaderId")
  REFERENCES "FeePaymentHeader"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
