-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "callerKey" TEXT NOT NULL,
    "locale" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "constraints" JSONB,
    "candidates" JSONB,
    "skeleton" JSONB,
    "cursor" JSONB,
    "filled" JSONB,
    "artifacts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_callerKey_expiresAt_idx" ON "Trip"("callerKey", "expiresAt");
