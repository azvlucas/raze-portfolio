-- CreateEnum
CREATE TYPE "PetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "petSizes" "PetSize"[] DEFAULT ARRAY[]::"PetSize"[];
