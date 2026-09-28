const Database = require("better-sqlite3");

const db = new Database("dev.db");

const existing = db
  .prepare(
    `
    SELECT id, number, name, type
    FROM Account
    WHERE companyId = ? AND number = ?
    `
  )
  .get(5, "2520");

if (existing) {
  console.log("2520 er þegar til:");
  console.log(existing);
} else {
  db.prepare(
    `
    INSERT INTO Account (
      number,
      name,
      type,
      isActive,
      companyId,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `
  ).run(
    "2520",
    "Innskattur",
    "VAT_INPUT",
    1,
    5
  );

  console.log("2520 – Innskattur stofnaður.");
}

const account = db
  .prepare(
    `
    SELECT id, number, name, type
    FROM Account
    WHERE companyId = ? AND number = ?
    `
  )
  .get(5, "2520");

console.log(account);

db.close();