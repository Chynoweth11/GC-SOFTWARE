-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN "byteSize" INTEGER;
ALTER TABLE "DocumentAttachment" ADD COLUMN "checksum" TEXT;
ALTER TABLE "DocumentAttachment" ADD COLUMN "contentType" TEXT;
ALTER TABLE "DocumentAttachment" ADD COLUMN "storage" TEXT;
ALTER TABLE "DocumentAttachment" ADD COLUMN "storageKey" TEXT;

