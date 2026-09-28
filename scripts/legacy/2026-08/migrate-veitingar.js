const Database = require("better-sqlite3");

const db = new Database("dev.db");

const receiptEntryIds = [
  25, 35, 41, 43, 48, 50, 55, 57, 62, 66, 68
];

const aiEntryIds = [
  51, 79, 85, 87, 92, 94, 111, 115, 117,
  137, 148, 150, 155, 161, 163
];

const migrate = db.transaction(() => {
  const updateReceiptEntry = db.prepare(`
    UPDATE ReceiptEntry
    SET account = '4910'
    WHERE id = ?
  `);

  const updateAiEntry = db.prepare(`
    UPDATE AiDetectedDocumentEntry
    SET account = '4910'
    WHERE id = ?
  `);

  for (const id of receiptEntryIds) {
    updateReceiptEntry.run(id);
  }

  for (const id of aiEntryIds) {
    updateAiEntry.run(id);
  }
});

migrate();

console.log(
  `Lokið: ${receiptEntryIds.length} bókaðar línur og ${aiEntryIds.length} AI-línur færðar á 4910.`
);