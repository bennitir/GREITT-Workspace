-- Eldri WorkOrder-status má ekki halda Verki lokuðu þegar varanlegur
-- Verkþáttur er enn opinn. COMPLETED og CANCELLED eru lokaðar/terminal
-- stöður á Verkþætti; aðrar stöður halda Verkinu opnu.
UPDATE "WorkOrder" AS work
SET
  "status" = 'IN_PROGRESS',
  "completedAt" = NULL
WHERE work."status" = 'COMPLETED'
  AND EXISTS (
    SELECT 1
    FROM "WorkPart" AS part
    WHERE part."workOrderId" = work."id"
      AND part."status" NOT IN ('COMPLETED', 'CANCELLED')
  );
