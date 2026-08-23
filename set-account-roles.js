const Database = require("better-sqlite3");

const db = new Database("dev.db");

const roleGroups = {
  PAYMENT: ["1000", "1510", "2000"],
  SYSTEM: ["2510", "2520", "2550", "2590"],
  REVENUE: ["3000", "3900"],
  EXPENSE: [
    "4000",
    "4310",
    "4510",
    "4530",
    "4700",
    "4900",
    "4910",
    "4950",
    "4960",
  ],
};

const update = db.prepare(`
  UPDATE Account
  SET entryRole = ?, updatedAt = datetime('now')
  WHERE companyId = ? AND number = ?
`);

for (const [role, numbers] of Object.entries(roleGroups)) {
  for (const number of numbers) {
    const result = update.run(role, 5, number);

    console.log(
      `${number}: ${
        result.changes === 1 ? role : "fannst ekki"
      }`
    );
  }
}

const accounts = db
  .prepare(`
    SELECT number, name, type, entryRole
    FROM Account
    WHERE companyId = ?
    ORDER BY number
  `)
  .all(5);

console.table(accounts);

db.close();