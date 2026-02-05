-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "channelAddress" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'QUEUED',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_id_status_idx" ON "Notification"("id", "status");
