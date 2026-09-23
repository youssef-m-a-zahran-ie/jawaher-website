-- CreateEnum
CREATE TYPE "AvailabilitySnapshotStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "variant_availability_snapshots" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "erpVariantId" TEXT NOT NULL,
    "presentationStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'erp_snapshot',
    "lastSuccessAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,

    CONSTRAINT "variant_availability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_snapshot_runs" (
    "id" TEXT NOT NULL,
    "status" "AvailabilitySnapshotStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,
    "variantsAttempted" INTEGER NOT NULL DEFAULT 0,
    "variantsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "variantsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,

    CONSTRAINT "availability_snapshot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_snapshot_locks" (
    "id" TEXT NOT NULL,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "runId" TEXT,

    CONSTRAINT "availability_snapshot_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "variant_availability_snapshots_variantId_key" ON "variant_availability_snapshots"("variantId");

-- CreateIndex
CREATE INDEX "variant_availability_snapshots_presentationStatus_idx" ON "variant_availability_snapshots"("presentationStatus");

-- CreateIndex
CREATE INDEX "availability_snapshot_runs_status_startedAt_idx" ON "availability_snapshot_runs"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "variant_availability_snapshots" ADD CONSTRAINT "variant_availability_snapshots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

