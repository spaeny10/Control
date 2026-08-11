-- The convenience fee is charged only when a card was actually used, which isn't
-- knowable until the invoice is paid — adding it up front would overcharge a
-- customer who then mails a check. So it's recorded on the paid invoice and
-- queued onto the customer's next one.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paidByCard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "convenienceFeeAmount" DECIMAL(12,2);
