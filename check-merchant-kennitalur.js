const Database = require("better-sqlite3");

const db = new Database("dev.db");

const kennitolur = {
  "Sports Direct Lindir IS": "6301121760",
  "Pítan": "4404250970",
  "Flatey Garðatorgi": "5303170990",
  "Skalli": "5509881009",
  "A4 Smáralind": "6002090270",
  "Langbest Restaurant": "5505080360",
  "Nettó Krossmóa": "5712983769",
  "KFC": "5401983149",
  "KFC Sundagörðum": "5401983149",
  "Ríkisskattstjóri": "5402696029",
  "Ríkisskattstjóri (RSK)": "5402696029",
  "Ríkisskattstjóri (Vefskil RSK)": "5402696029",
  "Spíran": "7008230320",
"F&S Outlet": "6011962479",
"Hagtákn": "5801942149",
};

const update = db.prepare(`
  UPDATE AiDetectedDocument
  SET merchantKennitala = ?
  WHERE merchantName = ?
    AND merchantKennitala IS NULL
`);

const transaction = db.transaction(() => {
  for (const [merchantName, kennitala] of Object.entries(kennitolur)) {
    const result = update.run(kennitala, merchantName);

    console.log(
      `${merchantName}: ${result.changes} færsla/færslur uppfærðar`
    );
  }
});

transaction();

const updatePitanByVoucher = db.prepare(`
  UPDATE AiDetectedDocument
  SET
    merchantName = 'Pítan',
    merchantKennitala = '4404250970'
  WHERE voucherNumber IN (452, 464)
`);

const pitanResult = updatePitanByVoucher.run();

console.log(
  `Pítan fylgiskjöl 452 og 464: ${pitanResult.changes} færslur uppfærðar`
);

console.log("Kennitölur uppfærðar.");

db.close();