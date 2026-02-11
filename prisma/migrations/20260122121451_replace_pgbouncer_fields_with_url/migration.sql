/*
  Warnings:

  - You are about to drop the column `pgbouncerHost` on the `connections` table. All the data in the column will be lost.
  - You are about to drop the column `pgbouncerPort` on the `connections` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "connections" DROP COLUMN "pgbouncerHost",
DROP COLUMN "pgbouncerPort",
ADD COLUMN     "pgbouncerUrl" TEXT;
