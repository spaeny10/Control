-- Separate a unit's physical journey from the subscription's billing.
--
-- Delivery and activation are independent events: a unit can be dropped weeks
-- before billing starts because a truck was already heading that way, and
-- billing can end before the pickup. Previously both were assumed to happen at
-- quote conversion, so every unit read DEPLOYED the moment a deal closed.

-- New physical states. ADD VALUE is safe inside a transaction on PG 12+ as long
-- as the new values aren't used in the same transaction, and nothing below uses
-- them.
ALTER TYPE "TrailerStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "TrailerStatus" ADD VALUE IF NOT EXISTS 'INSPECTION';

-- The truck event, distinct from the assignment.
ALTER TABLE "TrailerDeployment" ADD COLUMN "deliveredAt" TIMESTAMP(3);

-- Existing deployments predate the distinction and are all treated as on site
-- from the day they were assigned — that's what the app implied at the time.
UPDATE "TrailerDeployment" SET "deliveredAt" = "deployedAt";

CREATE INDEX "TrailerDeployment_subscriptionId_returnedAt_idx"
  ON "TrailerDeployment"("subscriptionId", "returnedAt");

-- When billing actually started. Null means PENDING.
ALTER TABLE "Subscription" ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Every existing subscription was activated at its start date, because
-- conversion always activated immediately.
UPDATE "Subscription" SET "activatedAt" = "startDate" WHERE "status" <> 'PENDING';
