const Database = require("better-sqlite3");

const db = new Database("dev.db");

const result = db
  .prepare(
    `
    UPDATE Account
    SET
      vatRate = ?,
      vatAccount = ?,
      vatRequiresConfirmation = ?,
      updatedAt = datetime('now')
    WHERE companyId = ? AND number = ?
    `
  )
  .run(11, "2520", 1, 1, "4910");

console.log("Breyttar færslur:", result.changes);

const account = db
  .prepare(
    `
    SELECT
      id,
      number,
      name,
      vatRate,
      vatAccount,
      vatRequiresConfirmation
    FROM Account
    WHERE companyId = ? AND number = ?
    `
  )
  .get(1, "4910");

console.log(account);

db.close();