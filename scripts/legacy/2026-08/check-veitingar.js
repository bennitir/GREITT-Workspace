const Database = require("better-sqlite3");

const db = new Database("dev.db");

console.log("\nReceiptEntry");
console.table(
  db.prepare(`
    SELECT id, account, debit, credit, receiptId, text
    FROM ReceiptEntry
    WHERE account IN ('4900', '4960')
      AND (
        text LIKE '%KFC%'
        OR text LIKE '%Pítan%'
        OR text LIKE '%Pitan%'
        OR text LIKE '%Flatey%'
        OR text LIKE '%Flatley%'
        OR text LIKE '%Spíran%'
        OR text LIKE '%Spiran%'
        OR text LIKE '%veiting%'
      )
    ORDER BY id
  `).all()
);

console.log("\nAiDetectedDocumentEntry");
console.table(
  db.prepare(`
    SELECT id, account, debit, credit, documentId, text
    FROM AiDetectedDocumentEntry
    WHERE account IN ('4900', '4960')
      AND (
        text LIKE '%KFC%'
        OR text LIKE '%Pítan%'
        OR text LIKE '%Pitan%'
        OR text LIKE '%Flatey%'
        OR text LIKE '%Flatley%'
        OR text LIKE '%Spíran%'
        OR text LIKE '%Spiran%'
        OR text LIKE '%veiting%'
      )
    ORDER BY id
  `).all()
);