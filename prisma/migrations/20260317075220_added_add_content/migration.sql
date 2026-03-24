-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PUBLISHED', 'PENDING');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "creatorName" TEXT,
ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'PUBLISHED';
