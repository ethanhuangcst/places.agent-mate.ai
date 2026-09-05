-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "placeId" TEXT,
    "queryNorm" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttractionPoi" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nativeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "cardSlim" JSONB NOT NULL,
    "details" JSONB,
    "detailsFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttractionPoi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Destination_lookupKey_key" ON "Destination"("lookupKey");

-- CreateIndex
CREATE INDEX "AttractionPoi_destinationId_idx" ON "AttractionPoi"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttractionPoi_destinationId_provider_nativeId_key" ON "AttractionPoi"("destinationId", "provider", "nativeId");

-- AddForeignKey
ALTER TABLE "AttractionPoi" ADD CONSTRAINT "AttractionPoi_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
