-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "heldAt" TIMESTAMPTZ(3),
ADD COLUMN     "heldReason" TEXT;
