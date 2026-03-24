-- CreateEnum
CREATE TYPE "ArtworkStatus" AS ENUM ('PUBLISHED', 'PENDING');

-- AlterTable
ALTER TABLE "Artwork" ADD COLUMN     "creatorName" TEXT,
ADD COLUMN     "status" "ArtworkStatus" NOT NULL DEFAULT 'PUBLISHED';
