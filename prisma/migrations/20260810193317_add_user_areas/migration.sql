-- CreateEnum
CREATE TYPE "AppArea" AS ENUM ('SALES', 'FLEET', 'ACCOUNTING', 'TECH_ADMIN');

-- Users get assigned areas; existing users keep full access
ALTER TABLE "User" ADD COLUMN "areas" "AppArea"[] DEFAULT ARRAY['SALES', 'FLEET', 'ACCOUNTING', 'TECH_ADMIN']::"AppArea"[];
UPDATE "User" SET "areas" = ARRAY['SALES', 'FLEET', 'ACCOUNTING', 'TECH_ADMIN']::"AppArea"[];
