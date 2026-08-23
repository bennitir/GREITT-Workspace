const Database = require("better-sqlite3");

const db = new Database("dev.db");

const rows = db
  .prepare(`
    SELECT
      id,
      receiptId,
      voucherNumber,
      merchantName,
      date
    FROM AiDetectedDocument
    WHERE voucherNumber = 469
      AND merchantName LIKE '%Langbest%'
  `)
  .all();

console.table(rows);

if (rows.length !== 1) {
  console.log(
    `STOPP: Fann ${rows.length} færslur. Engu var breytt.`
  );
  db.close();
  process.exit(1);
}

const document = rows[0];

db.prepare(`
  UPDATE AiDetectedDocument
  SET date = ?
  WHERE id = ?
`).run(
  "2026-04-11T00:00:00.000Z",
  document.id
);

const updated = db
  .prepare(`
    SELECT
      id,
      receiptId,
      voucherNumber,
      merchantName,
      date
    FROM AiDetectedDocument
    WHERE id = ?
  `)
  .get(document.id);

console.log("Eftir leiðréttingu:");
console.table([updated]);

db.close();