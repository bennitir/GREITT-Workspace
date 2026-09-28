const Database = require("better-sqlite3");

const db = new Database("dev.db");

console.table(
  db.prepare('PRAGMA table_info("UserCompany")').all()
);

db.close();