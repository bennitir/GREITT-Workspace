const Database = require("better-sqlite3");

const db = new Database("dev.db");

const fixes = [
  ["4310", "Skrifstofukostnaður"],
  ["4510", "Auglýsingakostnaður"],
  ["4700", "Bifreiðakostnaður"],
  ["4950", "Bankakostnaður"],
];

const update = db.prepare(`
  UPDATE Account
  SET name = ?, updatedAt = datetime('now')
  WHERE companyId = ? AND number = ?
`);

for (const [number, name] of fixes) {
  const result = update.run(name, 5, number);

  console.log(
    `${number}: ${result.changes === 1 ? name : "fannst ekki"}`
  );
}

const accounts = db.prepare(`
  SELECT number, name
  FROM Account
  WHERE companyId = ?
    AND number IN ('4310', '4510', '4700', '4950')
  ORDER BY number
`).all(5);

console.table(accounts);

db.close();
