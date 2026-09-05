"use server";
import {
  requireActiveCompanyWriteAccess,
  requireCompanyBookAccess,
  requireCompanyDeleteAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { cookies } from "next/headers";
import { createReadStream } from "fs";
import OpenAI from "openai";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
} from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

async function saveReceiptFile(file: File, companyId: number) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeFileName = file.name
  .replace(/ð/gi, "d")
  .replace(/þ/gi, "th")
  .replace(/æ/gi, "ae")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]/g, "_");

const storagePath = `${companyId}/${Date.now()}-${safeFileName}`;
  const { error } = await supabaseAdmin.storage
  .from("fylgiskjol")
  .upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

if (error) {
  throw new Error(`Mistókst að vista fylgiskjal í Supabase: ${error.message}`);
}

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads"
  );

  await mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name}`;
  const filePath = path.join(uploadDir, fileName);

  await writeFile(filePath, buffer);

  return {
  fileName,
  filePath: `/uploads/${fileName}`,
  storagePath,
};
}
async function backfillMissingReceiptHashes() {
  const receipts = await prisma.receipt.findMany({
    where: {
      fileHash: null,
    },
    select: {
      id: true,
      filePath: true,
    },
  });

  for (const receipt of receipts) {
  if (!receipt.filePath) {
    continue;
  }

  try {
      const fullPath = path.join(
        process.cwd(),
        "public",
        receipt.filePath
      );

      const buffer = await readFile(fullPath);

      const fileHash = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

      await prisma.receipt.update({
        where: {
          id: receipt.id,
        },
        data: {
          fileHash,
        },
      });
    } catch (error) {
      console.error(
        `Gat ekki búið til hash fyrir fylgiskjal ${receipt.id}:`,
        error
      );
    }
  }
}


  
async function archiveReceiptFile(
  receiptId: number
) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (
  receipt.aiDetectedDocuments.length === 0 &&
  receipt.voucherNumber === null
) {
  return;
}
  const isManualReceipt =
  receipt.aiDetectedDocuments.length === 0 &&
  receipt.voucherNumber !== null;

const allApproved = isManualReceipt
  ? receipt.status === "APPROVED"
  : receipt.aiDetectedDocuments.every(
      (document) =>
        document.approvedAt !== null &&
        document.voucherNumber !== null
    );

if (!allApproved) {
  return;
}

  const voucherNumbers = isManualReceipt
  ? [receipt.voucherNumber]
  : receipt.aiDetectedDocuments
      .map((document) => document.voucherNumber)
      .filter(
        (number): number is number =>
          number !== null
      )
      .sort((a, b) => a - b);

  const firstVoucherNumber = voucherNumbers[0];
  const lastVoucherNumber =
    voucherNumbers[voucherNumbers.length - 1];

  const voucherFolderName =
    firstVoucherNumber === lastVoucherNumber
      ? String(firstVoucherNumber)
      : `${firstVoucherNumber}-${lastVoucherNumber}`;

  const documentDate =
    receipt.aiDetectedDocuments[0]?.date ??
    receipt.date;

    if (!documentDate) {
  return;
}

  const year = String(
    documentDate.getFullYear()
  );

  const month = String(
    documentDate.getMonth() + 1
  ).padStart(2, "0");

  const archiveDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "fylgiskjol",
    year,
    month,
    voucherFolderName
  );

  await mkdir(archiveDir, {
    recursive: true,
  });

  if (!receipt.filePath || !receipt.fileName) {
  return;
}
  const oldFullPath = path.join(
    process.cwd(),
    "public",
    receipt.filePath
  );

  const archivedFileName =
  `${voucherFolderName}-${receipt.fileName}`;

  const newFullPath = path.join(
  archiveDir,
  archivedFileName
);

  const newPublicPath =
    `/uploads/fylgiskjol/${year}/${month}/${voucherFolderName}/${archivedFileName}`;

  if (receipt.filePath === newPublicPath) {
    return;
}
    await rename(oldFullPath, newFullPath);

await prisma.receipt.update({
  where: {
    id: receipt.id,
  },
  data: {
    filePath: newPublicPath,
  },
});
}
export async function createReceipt(formData: FormData) {
  await requireActiveCompanyWriteAccess();
  const file = formData.get("file") as File;
    if (!(file instanceof File) || file.size === 0) {
    throw new Error("Ekkert fylgiskjal var valið.");
  }
    const bytes = await file.arrayBuffer();
  const fileHash = crypto
    .createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");

      
    await backfillMissingReceiptHashes();

  
const receiptNumber =
  String(formData.get("receiptNumber") || "").trim();
const cookieStore = await cookies();
const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (!activeCompanyId) {
  throw new Error("Ekkert virkt fyrirtæki er valið.");
}

const companyId = Number(activeCompanyId);
const existingFile = await prisma.receipt.findFirst({
  where: {
    companyId,
    fileHash,
  },
});
console.log("DUPLICATE CHECK", {
  companyId,
  fileHash,
  existingFile,
});
if (existingFile) {
  throw new Error("Þetta skjal hefur þegar verið sótt fyrir þetta fyrirtæki.");
}
if (receiptNumber) {
  const existingReceipt = await prisma.receipt.findFirst({
    where: {
      receiptNumber,
    },
  });

  if (existingReceipt) {
    throw new Error("Þetta fylgiskjal er þegar skráð.");
  }
}

  const uploaded = await saveReceiptFile(file, companyId);

  const createdReceipt = await prisma.receipt.create({
    data: {
      date: formData.get("date")
  ? new Date(String(formData.get("date")))
  : null,

description:
  String(formData.get("description") || "").trim() ||
  "Ólesið fylgiskjal",

amount: formData.get("amount")
  ? Number(formData.get("amount"))
    : 0,
      receiptNumber: receiptNumber || null,
      companyId,
      fileName: uploaded.fileName,
      filePath: uploaded.filePath,
      storagePath: uploaded.storagePath,
      fileHash,
    },
  });
try {
  await analyzeReceiptWithAI(createdReceipt.id);
} catch (error) {
  console.error(
    `AI-lestur mistókst fyrir fylgiskjal ${createdReceipt.id}:`,
    error
  );
  await prisma.receipt.update({
  where: {
    id: createdReceipt.id,
  },
  data: {
    status: "NEEDS_ATTENTION",
    ocrStatus: "AI-lestur mistókst",
  },
});
}
  revalidatePath("/fylgiskjol");

  return {
  receiptId: createdReceipt.id,
};
}

export async function createManualReceipt(formData: FormData) {
  await requireActiveCompanyWriteAccess();
  const file = formData.get("file");

  
  const cookieStore = await cookies();
  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki er valið.");
  }

  const rawDate =
    String(formData.get("date") || "").trim();

  let parsedDate: Date | null = null;

  if (rawDate) {
    const match = rawDate.match(
      /^(\d{2})\.(\d{2})\.(\d{4})$/
    );

    if (!match) {
      throw new Error(
        "Dagsetning verður að vera á forminu dd.mm.áááá."
      );
    }

    const [, day, month, year] = match;

    parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );
  }

 const uploaded =
  file instanceof File && file.size > 0
    ? await saveReceiptFile(file, Number(activeCompanyId))
    : null;

    const rawVoucherNumber =
  String(formData.get("voucherNumber") || "").trim();

const voucherNumber =
  rawVoucherNumber !== ""
    ? Number(rawVoucherNumber)
    : null;

if (
  voucherNumber !== null &&
  (!Number.isInteger(voucherNumber) || voucherNumber <= 0)
) {
  throw new Error("Fylgiskjalsnúmer verður að vera jákvæð heiltala.");
}

if (voucherNumber !== null) {
  const existingVoucher = await prisma.receipt.findFirst({
    where: {
      companyId: Number(activeCompanyId),
      voucherNumber,
    },
  });

  if (existingVoucher) {
    throw new Error(
      `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
    );
  }
}

  const createdReceipt =
    await prisma.receipt.create({
      data: {
                date: parsedDate,
        description:
          String(
            formData.get("description") || ""
          ).trim() || "Handvirkt fylgiskjal",
        amount: formData.get("amount")
          ? Number(formData.get("amount"))
                    : 0,
                    receiptNumber: String(formData.get("receiptNumber") || "").trim() || null,
                    voucherNumber,
merchantName: String(formData.get("merchantName") || "").trim() || null,
merchantKennitala:
  String(formData.get("merchantKennitala") || "").trim() || null,
        companyId: Number(activeCompanyId),
        fileName: uploaded?.fileName ?? null,
filePath: uploaded?.filePath ?? null,
        status: "NEW",
      },
    });

  revalidatePath("/fylgiskjol");

  return {
    receiptId: createdReceipt.id,
  };
}

export async function addReceiptEntries(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const existingEntries = await prisma.receiptEntry.count({
    where: {
      receiptId,
    },
  });

  if (existingEntries > 0) {
    return;
  }

  await prisma.receiptEntry.createMany({
    data: [
      {
        account: "2550",
        text: "Staðgreiðsla",
        debit: 53508,
        credit: 0,
        receiptId,
      },
      {
        account: "4530",
        text: "Tryggingagjald",
        debit: 12532,
        credit: 0,
        receiptId,
      },
      {
        account: "1510",
        text: "Banki",
        debit: 0,
        credit: 66040,
        receiptId,
      },
    ],
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
}
export async function saveOcrResult(
    
  receiptId: number,
  data: {
    merchantName?: string;
    ocrText?: string;
    ocrConfidence?: number;
    ocrStatus?: string;
  }
) {
  await requireActiveCompanyWriteAccess();
  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      merchantName: data.merchantName ?? null,
      ocrText: data.ocrText ?? null,
      ocrConfidence: data.ocrConfidence ?? null,
      ocrStatus: data.ocrStatus ?? null,
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
}
export async function analyzeReceiptWithAI(receiptId: number) {
  const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60 * 1000,
  maxRetries: 0,
});
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      company: {
        include: {
          accounts: {
            where: {
              isActive: true,
            },
            orderBy: {
              number: "asc",
            },
          },
        },
      },
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.company.accounts.length === 0) {
    throw new Error(
      "Fyrirtækið er ekki með virkan reikningslykil."
    );
  }

  const companyAccountPromptText =
    receipt.company.accounts
      .map(
        (account) =>
          `${account.number} – ${account.name} [${account.type}]`
      )
      .join("\n");
      if (!receipt.filePath) {
  throw new Error("Ekkert stafrænt frumskjal er tengt þessu fylgiskjali.");
}

  const fullPath = path.join(
    process.cwd(),
    "public",
    receipt.filePath
  );

  const extension = path
    .extname(fullPath)
    .toLowerCase();

  const isImage = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ].includes(extension);

  let uploadedFileId: string | null = null;
  let imageDataUrl: string | null = null;

  if (isImage) {
    const imageBuffer = await readFile(fullPath);

    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";

    imageDataUrl =
      `data:${mimeType};base64,${imageBuffer.toString(
        "base64"
      )}`;
  } else {
    const uploadedFile =
      await openai.files.create({
        file: createReadStream(fullPath),
        purpose: "user_data",
      });

    uploadedFileId = uploadedFile.id;
  }

  const response = await openai.responses.create({
    model: "gpt-5.6",
    input: [
      {
        role: "user",
        content: [
          ...(isImage && imageDataUrl
            ? [
                {
                  type: "input_image" as const,
                  image_url: imageDataUrl,
                  detail: "auto" as const,
                },
              ]
            : uploadedFileId
              ? [
                  {
                    type: "input_file" as const,
                    file_id: uploadedFileId,
                  },
                ]
              : []),

          {
            type: "input_text",
            text: `
Lestu þetta íslenska bókhaldsfylgiskjal vandlega.

Fyrirtækið sem bókar fylgiskjalið er:
Nafn: ${receipt.company.name}
VSK-númer: ${receipt.company.vatNumber ?? "Ekki skráð"}
RSK-skráð starfsemi: ${receipt.company.rskRegisteredActivities ?? "Ekki skráð"}
Virk starfsemi: ${receipt.company.activeActivities ?? "Ekki staðfest"}

Mikilvægt um fyrirtækið:
RSK-skráð starfsemi segir hvað fyrirtækið er skráð fyrir,
en ekki endilega hvaða starfsemi er raunverulega virk.

Við bókun skal fyrst og fremst miða við "Virk starfsemi".

Ekki nota RSK-skráða starfsemi sem sjálfstæð rök
fyrir frádrætti eða VSK-meðferð ef starfsemin er ekki
staðfest sem virk.

Teldu hversu mörg sjálfstæð bókhaldsfylgiskjöl eru á myndinni.

Fyrir hvert sjálfstætt fylgiskjal skal einnig skila pageNumber.

pageNumber er númer þeirrar PDF-síðu eða myndasíðu þar sem aðalskjal fylgiskjalsins er staðsett.

Ef fylgiskjal nær yfir fleiri en eina síðu skal nota síðuna þar sem aðalsölukvittun/reikningur er.

Ef ekki er hægt að ákvarða síðuna með vissu skal skila null.

Eitt bókhaldsfylgiskjal getur samanstaðið af fleiri en
einu blaði eða kvittun.

Ef kassakvittun, kortakvittun, greiðslukvittun eða annað
skjal er heft eða fest við handskrifaða kvittun, reikning
eða annað undirskjal og skjölin augljóslega tilheyra sömu
viðskiptum, skal telja þau saman sem EITT fylgiskjal.

Ekki telja hvert blað sjálfkrafa sem sérstakt fylgiskjal.

Mjög mikilvægt um greiðslukvittanir:

Kortakvittun, POS-kvittun eða önnur greiðslustaðfesting
er EKKI sjálfstætt bókhaldsfylgiskjal þegar hún einungis
staðfestir greiðslu á kassakvittun, sölukvittun eða reikningi
sem fylgir með.

Ef sölukvittun/reikningur og kortakvittun sýna sömu upphæð
má aðeins telja þau EITT bókhaldsfylgiskjal þegar önnur gögn
styðja einnig skýrt að um sömu greiðslu sé að ræða.

Sama upphæð ein og sér er EKKI næg sönnun.

Berðu sérstaklega saman:
- dagsetningu viðskiptanna,
- nafn söluaðila eða greiðsluaðila,
- kortanúmer/endatölur ef þær sjást,
- reiknings-, pöntunar- eða færslunúmer,
- og hvort skjölin séu greinilega fest saman sem ein færsla.

Ef dagsetningar eru verulega mismunandi eða skjölin sýna
ólíka söluaðila og ekkert annað tengir þau ótvírætt saman,
skal telja þau sem TVÖ sjálfstæð bókhaldsfylgiskjöl,
jafnvel þótt upphæðin sé sú sama.

Kortakvittun skal aðeins vera stuðningsskjal þegar skýrt er
að hún staðfesti greiðslu á aðalskjalinu.

documentCount verður að vera sami fjöldi og fjöldi staka
í documents fylkinu.

Aðskilin skjöl sem tilheyra mismunandi viðskiptum skulu
teljast sem sitt hvort fylgiskjalið.

documentCount skal vera fjöldi sjálfstæðra
bókhaldsfylgiskjala, ekki fjöldi blaða eða pappírsbúta.

Finndu aðeins það sem raunverulega sést á skjalinu.
Ekki giska á óskýrar tölur eða númer.

Mikilvægar reglur um dagsetningar:

- Finndu dagsetningu fyrst og fremst í prentuðum reit sem er
  greinilega merktur sem dagsetning, t.d. "Dags.", "Dagsetning",
  "Date" eða sambærilegt.

- Í íslenskum skjölum skal túlka dagsetningar sem
  DAGUR.MÁNUÐUR.ÁR, ekki MÁNUÐUR.DAGUR.ÁR.

- Ef prentuð dagsetning er t.d. 15.03.26 skal skila
  2026-03-15.

- Tveggja stafa ártal 00-49 skal túlka sem 2000-2049,
  nema skjalið gefi skýrt annað til kynna.

- Handskrifaðar tölur, fylgiskjalsnúmer, reikningslyklar,
  bókhaldsmerkingar og upphæðir mega ALDREI vera túlkaðar
  sem dagsetning nema þær séu ótvírætt merktar sem dagsetning.

- Ef dagsetning er ólæsileg eða óviss skal skila null
  frekar en að giska.

Leggðu einnig til fulla bókun þegar reikningslykill
fyrirtækisins inniheldur viðeigandi reikninga.

Samtala debetlína og kreditlína verður alltaf að vera jöfn.

REIKNINGSLYKILL FYRIRTÆKISINS:

${companyAccountPromptText}

Reglur um reikningslykla:

1. Í bookingEntries skal account ALLTAF vera nákvæmlega
   eitt reikningsnúmer úr listanum hér að ofan.

2. Ekki finna upp reikningsnúmer.

3. Ekki nota annan reikning sem neyðarlausn bara vegna þess
   að nákvæmur reikningur vantar.

4. Ef enginn núverandi reikningslykill passar nægilega vel:
   - ekki velja óskyldan almennan lykil bara til að klára bókun,
   - ekki finna upp reikningsnúmer,
   - skila frekar tillögu um að stofna nýjan reikningslykil,
   - merkja slíka tillögu sérstaklega þannig að notandi þurfi að staðfesta hana áður en bókun er samþykkt.   

5. Notaðu type innan hornklofa til að skilja bókhaldslega
   merkingu reikningsins.

6. Ef fylgiskjalið er sölureikningur skal almennt leita að:
   - ACCOUNTS_RECEIVABLE fyrir viðskiptakröfu,
   - REVENUE fyrir sölu/tekjur,
   - VAT_OUTPUT fyrir útskatt þegar VSK á við.

7. Ef fylgiskjalið er innkaupareikningur eða kostnaður skal
   velja viðeigandi kostnaðarreikning og greiðslu-/skuldareikning.

8. VAT_INPUT má aðeins nota þegar innskattsfrádráttur er
   heimill.

9. BANK skal aðeins nota þegar skjalið sýnir eða gögnin
   styðja að viðskiptin hafi þegar verið greidd af banka.

10. Ef enginn reikningur í reikningslykli fyrirtækisins
   passar bókhaldslega við færsluna:
   - ekki finna upp lykil,
   - skilaðu bookingEntries sem tómu fylki fyrir það skjal,
   - útskýrðu í summary hvaða reikningstegund vantar.

Mikilvæg VSK-regla:

Ekki færa virðisaukaskatt af fæðiskaupum, veitingum,
kaffistofu eða mötuneyti sem innskatt nema fyrir liggi
skýr heimild til þess, svo sem þegar fæðið er endurselt.

Ef fylgiskjalið er fyrir mat eða veitingar og virk starfsemi
fyrirtækisins gefur ekki skýrt tilefni til
innskattsfrádráttar, skal bóka alla heildarupphæðina sem
kostnað án innskattsfrádráttar.

Ekki nota VAT_INPUT eingöngu vegna þess að VSK sé sýndur
á kvittuninni.

Ef kvittana-, reiknings- eða vörusölunúmer sést ekki,
skilaðu null.

Ef eitthvað er óljóst skal confidence vera lægra.

MIKILVÆG DAGSETNINGARREGLA:

Lesið dagsetningu nákvæmlega af fylgiskjalinu.
Ekki giska á, leiðrétta eða breyta ári.
Ef ártal er 2026 á fylgiskjali má aldrei skila 2025.
Skila skal dagsetningu á forminu YYYY-MM-DD.
Ef dagsetning eða ártal er ólæsilegt eða óvíst skal skila date sem null.
            `,
          },
        ],
      },
    ],

    text: {
      format: {
        type: "json_schema",
        name: "receipt_analysis",
        strict: true,

        schema: {
          type: "object",

          properties: {
            documentCount: {
              type: "number",
            },

            documents: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  merchantName: {
                    type: ["string", "null"],
                  },

                  date: {
  type: ["string", "null"],
  description:
    "Dagsetning nákvæmlega eins og hún kemur fram á fylgiskjalinu. Skilaðu sem YYYY-MM-DD. Ekki giska á eða breyta ári. Ef árið er ólæsilegt eða óvíst skal skila null.",
},

                  receiptNumber: {
                    type: ["string", "null"],
                  },

                  totalAmount: {
                    type: ["number", "null"],
                  },

                  pageNumber: {
  type: ["number", "null"],
},

                  summary: {
                    type: "string",
                  },

                  bookingEntries: {
                    type: "array",

                    items: {
                      type: "object",

                      properties: {
                        account: {
                          type: "string",
                        },

                        text: {
                          type: "string",
                        },

                        debit: {
                          type: "number",
                        },

                        credit: {
                          type: "number",
                        },
                      },

                      required: [
                        "account",
                        "text",
                        "debit",
                        "credit",
                      ],

                      additionalProperties: false,
                    },
                  },
                },

                required: [
                  "merchantName",
                  "date",
                  "receiptNumber",
                  "totalAmount",
                  "summary",
                  "bookingEntries",
                  "pageNumber",
                ],

                additionalProperties: false,
              },
            },

            merchantName: {
              type: ["string", "null"],
            },

            date: {
              type: ["string", "null"],
              description:
                "Dagsetning á forminu YYYY-MM-DD",
            },

            receiptNumber: {
              type: ["string", "null"],
            },

            totalAmount: {
              type: ["number", "null"],
            },

            confidence: {
              type: "number",
            },

            summary: {
              type: "string",
            },

            suggestedDebitAccount: {
              type: ["string", "null"],
            },

            suggestedCreditAccount: {
              type: ["string", "null"],
            },

            suggestedBookingText: {
              type: ["string", "null"],
            },

            bookingEntries: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  account: {
                    type: "string",
                  },

                  text: {
                    type: "string",
                  },

                  debit: {
                    type: "number",
                  },

                  credit: {
                    type: "number",
                  },
                },

                required: [
                  "account",
                  "text",
                  "debit",
                  "credit",
                ],

                additionalProperties: false,
              },
            },
          },

          required: [
            "documentCount",
            "documents",
            "merchantName",
            "date",
            "receiptNumber",
            "totalAmount",
            "confidence",
            "summary",
            "suggestedDebitAccount",
            "suggestedCreditAccount",
            "suggestedBookingText",
            "bookingEntries",
          ],

          additionalProperties: false,
        },
      },
    },
  });
const inputTokens = response.usage?.input_tokens ?? 0;
const cachedInputTokens =
  response.usage?.input_tokens_details?.cached_tokens ?? 0;
const outputTokens = response.usage?.output_tokens ?? 0;
const totalTokens = response.usage?.total_tokens ?? 0;
  const result = JSON.parse(
    response.output_text
  );
  const actualDocumentCount = Array.isArray(result.documents)
  ? result.documents.length
  : 0;

const reportedDocumentCount = Number(result.documentCount ?? 0);

const documentCountMismatch =
  reportedDocumentCount !== actualDocumentCount;

  if (documentCountMismatch) {
  console.warn(
    `⚠️ Fjöldi fylgiskjala stemmir ekki. AI sagði ${reportedDocumentCount}, en documents inniheldur ${actualDocumentCount}.`
  );
}
  const uncachedInputTokens = Math.max(
  inputTokens - cachedInputTokens,
  0
);



const costUsd =
  (uncachedInputTokens / 1_000_000) * 5 +
  (cachedInputTokens / 1_000_000) * 0.5 +
  (outputTokens / 1_000_000) * 30;

const usdIskRate = 122.94;
const costIsk = costUsd * usdIskRate;

await prisma.aiUsage.create({
  data: {
    companyId: receipt.companyId,
    receiptId,
    action: "RECEIPT_ANALYSIS",
    model: "gpt-5.6",
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    costIsk,
    usdIskRate,
  },
});

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: {
        id: receiptId,
      },

      data: {
        merchantName: result.merchantName,
        receiptNumber: result.receiptNumber,
        ocrConfidence: result.confidence,
        ocrText: result.summary,
        ocrStatus: "Lesið með AI",

        aiDate: result.date
          ? new Date(result.date)
          : null,

        aiAmount:
          result.totalAmount ?? null,

        documentCount:
  actualDocumentCount,

        suggestedDebitAccount:
          result.suggestedDebitAccount,

        suggestedCreditAccount:
          result.suggestedCreditAccount,

        suggestedBookingText:
          result.suggestedBookingText,
          
      },
    });

    await tx.aiBookingEntry.deleteMany({
      where: {
        receiptId,
      },
    });

    if (
  (!Array.isArray(result.documents) || result.documents.length === 0) &&
  Array.isArray(result.bookingEntries) &&
  result.bookingEntries.length > 0
) {
      await tx.aiBookingEntry.createMany({
        data: result.bookingEntries.map(
          (entry: {
            account: string;
            text: string;
            debit: number;
            credit: number;
          }) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
            receiptId,
          })
        ),
      });
    }

    await tx.aiDetectedDocument.deleteMany({
      where: {
        receiptId,
      },
    });

    if (
      Array.isArray(result.documents) &&
      result.documents.length > 0
    ) {

const dateWarnings: string[] = [];

      for (const document of result.documents) {
        const parsedDocumentDate = document.date
  ? new Date(document.date)
  : null;

const today = new Date();
today.setHours(23, 59, 59, 999);

const fourMonthsAgo = new Date();
fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

const isFutureDate =
  parsedDocumentDate !== null &&
  parsedDocumentDate > today;

const isOldDate =
  parsedDocumentDate !== null &&
  parsedDocumentDate < fourMonthsAgo;

  if (isFutureDate) {
  dateWarnings.push(
    `Dagsetning ${document.date} er í framtíðinni.`
  );
}

if (isOldDate) {
  dateWarnings.push(
    `Dagsetning ${document.date} er eldri en 4 mánuðir. Athuga VSK-tímabil.`
  );
}

  const hasInvalidDate =
  parsedDocumentDate !== null &&
  Number.isNaN(parsedDocumentDate.getTime());

if (hasInvalidDate) {
  throw new Error(
    `Ógild dagsetning kom frá AI: ${document.date}`
  );
}

        const createdDocument =
          await tx.aiDetectedDocument.create({
            data: {
              merchantName:
                document.merchantName,

              date: parsedDocumentDate,

              receiptNumber:
                document.receiptNumber,

              totalAmount:
                document.totalAmount,

                pageNumber:
  document.pageNumber,

              summary:
                document.summary,

              receiptId,
            },
          });

        if (
          Array.isArray(
            document.bookingEntries
          ) &&
          document.bookingEntries.length > 0
        ) {
          await tx.aiDetectedDocumentEntry.createMany({
            data:
              document.bookingEntries.map(
                (entry: {
                  account: string;
                  text: string;
                  debit: number;
                  credit: number;
                }) => ({
                  account:
                    entry.account,

                  text:
                    entry.text,

                  debit:
                    entry.debit,

                  credit:
                    entry.credit,

                  documentId:
                    createdDocument.id,
                })
              ),
          });
        }
      }

if (dateWarnings.length > 0) {
  await tx.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
      ocrStatus: dateWarnings.join(" "),
    },
  });
}
      
    } else {
  await tx.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
      ocrStatus: "Engin læsileg fylgiskjöl fundust",
    },
  });
}
  });

  

  revalidatePath(
    `/fylgiskjol/${receiptId}`
  );

  revalidatePath("/fylgiskjol");
}

export async function confirmInsightEntityAccountLink(
  documentId: number,
  entityId: number,
  accountNumber: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
      entityLinks: {
        where: { entityId, role: "LOAN" },
        include: { entity: true },
      },
    },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að breyta lánatengingu eftir bókun.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að breyta lánatengingu á afgreiddu skjali.");
  }

  const entityLink = document.entityLinks[0];
  if (!entityLink || entityLink.entity.entityType !== "LOAN") {
    throw new Error("Lánatenging fannst ekki á þessu fylgiskjali.");
  }

  if (entityLink.entity.companyId !== document.receipt.companyId) {
    throw new Error("Lánið tilheyrir ekki sama fyrirtæki og fylgiskjalið.");
  }

  const cleanAccountNumber = accountNumber.trim();
  if (!cleanAccountNumber) throw new Error("Velja þarf skuldareikning.");

  const account = await prisma.account.findFirst({
    where: {
      companyId: document.receipt.companyId,
      number: cleanAccountNumber,
      isActive: true,
      type: {
        in: ["SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"],
      },
    },
  });

  if (!account) {
    throw new Error("Velja þarf virkan skuldareikning (skammtíma- eða langtímaskuld) hjá fyrirtækinu.");
  }

  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const existingLinks = await tx.insightEntityAccountLink.findMany({
      where: { entityId, role: "LIABILITY_PRINCIPAL" },
      include: { account: true },
    });

    const previousConfirmed = existingLinks.find(
      (link) => link.status === "CONFIRMED"
    );

    await tx.insightEntityAccountLink.updateMany({
      where: {
        entityId,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
      },
      data: { status: "REJECTED" },
    });

    await tx.insightEntityAccountLink.upsert({
      where: {
        entityId_accountId_role: {
          entityId,
          accountId: account.id,
          role: "LIABILITY_PRINCIPAL",
        },
      },
      update: {
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Skuldareikningur staðfestur af notanda.",
      },
      create: {
        entityId,
        accountId: account.id,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Skuldareikningur staðfestur af notanda.",
      },
    });

    await tx.insightEntity.update({
      where: { id: entityId },
      data: {
        relationshipStatus: "CONFIRMED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "InsightEntity",
        entityId,
        action: "CONFIRM_ACCOUNT_LINK",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Skuldareikningur ${account.number} staðfestur fyrir ${entityLink.entity.name}.`,
        beforeData: previousConfirmed
          ? {
              accountId: previousConfirmed.accountId,
              accountNumber: previousConfirmed.account.number,
              role: previousConfirmed.role,
              status: previousConfirmed.status,
            }
          : undefined,
        afterData: {
          accountId: account.id,
          accountNumber: account.number,
          role: "LIABILITY_PRINCIPAL",
          status: "CONFIRMED",
          confirmedAt: confirmedAt.toISOString(),
          confirmedBy: user.id,
        },
        metadata: {
          receiptId: document.receiptId,
          detectedDocumentId: document.id,
          insightEntityId: entityId,
          identifierType: entityLink.entity.identifierType,
          identifierValue: entityLink.entity.identifierValue,
        },
      },
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}

  export async function reviewDetectedDocument(documentId: number) {
  const document = await prisma.aiDetectedDocument.findFirst({
    where: {
      id: documentId,
    },
    include: {
      receipt: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (document.reviewedAt) {
    throw new Error("Þetta fylgiskjal hefur þegar verið yfirfarið.");
  }

  await prisma.$transaction(async (tx) => {
    const reviewedAt = new Date();

    await tx.aiDetectedDocument.update({
      where: {
        id: documentId,
      },
      data: {
        reviewedAt,
      },
    });

    await tx.receipt.update({
      where: {
        id: document.receiptId,
      },
      data: {
        status: "REVIEWED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action: "REVIEW_RECEIPT",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: "Fylgiskjal yfirfarið.",
        afterData: {
          status: "REVIEWED",
          reviewedAt: reviewedAt.toISOString(),
        },
        metadata: {
          reviewMethod: "AI_DOCUMENT",
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
        },
      },
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}

export async function markDetectedDocumentOutsideBusiness(
  documentId: number,
  reason: string
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "OUTSIDE_BUSINESS",
    reason
  );
}

export async function retainDetectedDocumentForInsight(
  documentId: number,
  reason = "Varðveitt sem hluti af Innsýn án bókunar."
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "INSIGHT_ONLY",
    reason
  );
}

export async function resolveDetectedDocumentAsSupporting(
  documentId: number,
  reason = "Afgreitt sem stuðningsskjal við annan fjárhagsatburð."
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "SUPPORTING_RESOLVED",
    reason
  );
}

async function finalizeDetectedDocumentWithoutBooking(
  documentId: number,
  disposition: "OUTSIDE_BUSINESS" | "INSIGHT_ONLY" | "SUPPORTING_RESOLVED",
  reason: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error("Skrá þarf stutta skýringu á afgreiðslu skjalsins.");
  }

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að afgreiða bókfært fylgiskjal án bókunar.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Þetta fylgiskjal hefur þegar verið endanlega afgreitt.");
  }

  const disposedAt = new Date();
  const action =
    disposition === "INSIGHT_ONLY"
      ? "RETAIN_FOR_INSIGHT"
      : disposition === "SUPPORTING_RESOLVED"
        ? "RESOLVE_SUPPORTING_DOCUMENT"
        : "MARK_OUTSIDE_BUSINESS";
  const description =
    disposition === "INSIGHT_ONLY"
      ? "Fylgiskjal varðveitt fyrir Innsýn án bókunar."
      : disposition === "SUPPORTING_RESOLVED"
        ? "Fylgiskjal afgreitt sem stuðningsskjal án sjálfstæðrar bókunar."
        : "Fylgiskjal afgreitt án bókunar – utan atvinnurekstrarbókhalds.";

  await prisma.$transaction(async (tx) => {
    await tx.aiDetectedDocument.update({
      where: { id: document.id },
      data: {
        disposition,
        dispositionReason: cleanReason,
        disposedAt,
        disposedById: user.id,
        reviewedAt: document.reviewedAt ?? disposedAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action,
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description,
        afterData: {
          disposition,
          dispositionReason: cleanReason,
          disposedAt: disposedAt.toISOString(),
          disposedById: user.id,
        },
        metadata: {
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
          documentType: document.documentType,
          documentRole: document.documentRole,
          reason: cleanReason,
        },
      },
    });

    const remainingUnresolved = await tx.aiDetectedDocument.count({
      where: {
        receiptId: document.receiptId,
        approvedAt: null,
        disposedAt: null,
        id: { not: document.id },
      },
    });

    if (remainingUnresolved === 0) {
      const approvedCount = await tx.aiDetectedDocument.count({
        where: {
          receiptId: document.receiptId,
          approvedAt: { not: null },
        },
      });

      await tx.receipt.update({
        where: { id: document.receiptId },
        data: { status: approvedCount > 0 ? "APPROVED" : "NOT_BOOKED" },
      });
    }
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/innsyn");
  revalidatePath("/");
}

export async function markDetectedDocumentDuplicate(
  documentId: number,
  duplicateOfDocumentId: number,
  duplicateVoucherNumber: number
) {
  await requireActiveCompanyWriteAccess();
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }
  

  await prisma.aiDetectedDocument.update({
    where: { id: documentId },
    data: {
      duplicateOfDocumentId,
      duplicateVoucherNumber,
      duplicateMarkedAt: new Date(),
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}

 export async function approveDetectedDocument(
  documentId: number,
  manualVoucherNumber?: number,
  allowPossibleDuplicate = false
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: {
      id: documentId,
    },
    include: {
      bookingEntries: true,
      receipt: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (!document.reviewedAt) {
  throw new Error(
    "Ekki er hægt að bóka fylgiskjal fyrr en það hefur verið yfirfarið."
  );
}

  if (document.bookingEntries.length === 0) {
    throw new Error(
      "Engar bókunarlínur fundust fyrir fylgiskjalið."
    );
  }


  if (
    document.approvedAt ||
    document.voucherNumber != null
  ) {
    throw new Error(
      "Þetta fylgiskjal hefur þegar verið samþykkt."
    );
  }
if (!document.date) {
  throw new Error(
    "Ekki er hægt að bóka fylgiskjal sem vantar dagsetningu."
  );
}

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: {
        id: document.receipt.companyId,
      },
    });

    if (!company) {
      throw new Error("Fyrirtæki fannst ekki.");
    }
// Öryggisvörn gegn tvíbókun sama fylgiskjals
if (document.receiptNumber) {
  if (
  !allowPossibleDuplicate &&
  document.merchantName &&
  document.date &&
  document.totalAmount != null
) {
  const possibleDuplicate =
    await tx.aiDetectedDocument.findFirst({
      where: {
        id: {
          not: document.id,
        },
        merchantName: document.merchantName,
        date: document.date,
        totalAmount: document.totalAmount,
        receipt: {
          companyId: company.id,
        },
        approvedAt: {
          not: null,
        },
      },
    });

  if (possibleDuplicate) {
    throw new Error(
      `POSSIBLE_DUPLICATE|${possibleDuplicate.receiptId}|${possibleDuplicate.id}|${possibleDuplicate.voucherNumber ?? ""}|${document.merchantName}|${document.totalAmount}`
    );
  }
}
  const duplicateDocument = await tx.aiDetectedDocument.findFirst({
    where: {
      id: { not: document.id },
      receiptNumber: document.receiptNumber,
      receipt: {
        companyId: company.id,
      },
      approvedAt: {
        not: null,
      },
    },
  });

  if (duplicateDocument) {
    throw new Error(
      `Möguleg tvíbókun: reiknings-/kvittunarnúmer ${document.receiptNumber} hefur þegar verið bókað` +
        (duplicateDocument.voucherNumber
          ? ` sem fylgiskjal ${duplicateDocument.voucherNumber}.`
          : ".")
    );
  }
}

const olderUnbookedDocument =
  await tx.aiDetectedDocument.findFirst({
    where: {
      id: {
        not: document.id,
      },
      receipt: {
        companyId: company.id,
      },
      approvedAt: null,
      date: {
        not: null,
        lt: new Date(
          Date.UTC(
            document.date!.getUTCFullYear(),
            document.date!.getUTCMonth(),
            document.date!.getUTCDate(),
          ),
        ),
      },
    },
    orderBy: {
      date: "asc",
    },
  });

if (olderUnbookedDocument?.date) {
  throw new Error(
    `OLDER_UNBOOKED|${olderUnbookedDocument.receiptId}|${olderUnbookedDocument.id}|${olderUnbookedDocument.date.toISOString()}`
  );
}

    let voucherNumber: number;

    if (manualVoucherNumber === undefined) {
      const allocated = await tx.$queryRaw<{ voucherNumber: number }[]>`
        UPDATE "Company"
        SET "nextVoucherNumber" = "nextVoucherNumber" + 1
        WHERE "id" = ${company.id}
        RETURNING "nextVoucherNumber" - 1 AS "voucherNumber"
      `;

      if (!allocated[0]) {
        throw new Error("Ekki tókst að úthluta fylgiskjalsnúmeri.");
      }

      voucherNumber = Number(allocated[0].voucherNumber);
    } else {
      voucherNumber = manualVoucherNumber;
    }

const usedByAi =
  await tx.aiDetectedDocument.findFirst({
    where: {
      receipt: {
        companyId: company.id,
      },
      voucherNumber,
    },
  });

const usedByManual =
  await tx.receipt.findFirst({
    where: {
      companyId: company.id,
      voucherNumber,
    },
  });

if (usedByAi || usedByManual) {
  throw new Error(
    `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
  );
}

    try {
      await tx.voucherNumberReservation.create({
        data: {
          companyId: company.id,
          voucherNumber,
          sourceType: "AI_DOCUMENT",
          sourceId: document.id,
        },
      });
    } catch {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} var tekið af öðrum notanda á sama tíma. Reyndu aftur.`
      );
    }

    await tx.receiptEntry.createMany({
      data: document.bookingEntries.map(
        (entry) => ({
          account: entry.account,
          text: entry.text,
          debit: entry.debit,
          credit: entry.credit,
          receiptId: document.receiptId,
        })
      ),
    });

    const hasVatActivity = document.bookingEntries.some(
  (entry) =>
    entry.account === "2510" ||
    entry.account === "2520"
);

const isVatSettlement = document.bookingEntries.some(
  (entry) => entry.account === "2590"
);

if (hasVatActivity && !isVatSettlement) {
  const vatYear = document.date!.getUTCFullYear();
  const vatPeriod =
    Math.floor(document.date!.getUTCMonth() / 2) + 1;

  await tx.vatPeriod.upsert({
    where: {
      companyId_year_period: {
        companyId: company.id,
        year: vatYear,
        period: vatPeriod,
      },
    },
    update: {},
    create: {
      companyId: company.id,
      year: vatYear,
      period: vatPeriod,
      status: "OPEN",
    },
  });
}

    const approvedAt = new Date();

    await tx.aiDetectedDocument.update({
      where: {
        id: document.id,
      },
      data: {
        approvedAt,
        voucherNumber,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: company.id,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action: "BOOK_RECEIPT",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Fylgiskjal ${voucherNumber} bókað.`,
        afterData: {
          status: "APPROVED",
          approvedAt: approvedAt.toISOString(),
          voucherNumber,
        },
        metadata: {
          bookingMethod: "AI_DOCUMENT",
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          voucherNumber,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
          bookingEntries: document.bookingEntries.map((entry) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
          })),
        },
      },
    });

const remainingUnapproved =
  await tx.aiDetectedDocument.count({
    where: {
      receiptId: document.receiptId,
      approvedAt: null,
      id: {
        not: document.id,
      },
    },
  });

if (remainingUnapproved === 0) {
  await tx.receipt.update({
    where: {
      id: document.receiptId,
    },
    data: {
      status: "APPROVED",
    },
  });

  await archiveReceiptFile(document.receiptId);
}
  });

  

  revalidatePath(
    `/fylgiskjol/${document.receiptId}`
  );
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}
  export async function approveAiSuggestion(receiptId: number) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (!receipt.aiDate || receipt.aiAmount == null) {
    throw new Error("Engin full AI-tillaga er til að samþykkja.");
  }

  const aiEntries = await prisma.aiBookingEntry.findMany({
    where: {
      receiptId,
    },
  });

  if (aiEntries.length === 0) {
    throw new Error("Engin AI-bókhaldstillaga er til að samþykkja.");
  }

  const existingEntries = await prisma.receiptEntry.count({
    where: {
      receiptId,
    },
  });

  if (existingEntries > 0) {
    throw new Error("Þetta fylgiskjal hefur þegar verið bókað.");
  }

  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      date: receipt.aiDate,
      amount: receipt.aiAmount,
      aiApprovedAt: new Date(),
    },
  });

  await prisma.receiptEntry.createMany({
    data: aiEntries.map((entry) => ({
      account: entry.account,
      text: entry.text,
      debit: entry.debit,
      credit: entry.credit,
      receiptId,
    })),
  });
  }
export async function approveManualReceipt(
  receiptId: number,
  bookingEntries: {
    account: string;
    text: string;
    debit: number;
    credit: number;
  }[]
) {
  await requireActiveCompanyWriteAccess();

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
  throw new Error("Þetta fylgiskjal hefur þegar verið bókað.");
}

  if (bookingEntries.length === 0) {
    throw new Error("Engar bókunarlínur fundust.");
  }

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: {
        id: receipt.companyId,
      },
    });

    if (!company) {
      throw new Error("Fyrirtæki fannst ekki.");
    }

    let voucherNumber: number;

    if (receipt.voucherNumber == null) {
      const allocated = await tx.$queryRaw<{ voucherNumber: number }[]>`
        UPDATE "Company"
        SET "nextVoucherNumber" = "nextVoucherNumber" + 1
        WHERE "id" = ${company.id}
        RETURNING "nextVoucherNumber" - 1 AS "voucherNumber"
      `;

      if (!allocated[0]) {
        throw new Error("Ekki tókst að úthluta fylgiskjalsnúmeri.");
      }

      voucherNumber = allocated[0].voucherNumber;
    } else {
      voucherNumber = receipt.voucherNumber;
    }

    const usedByAi =
      await tx.aiDetectedDocument.findFirst({
        where: {
          receipt: {
            companyId: company.id,
          },
          voucherNumber,
        },
      });

    const usedByManual =
  await tx.receipt.findFirst({
    where: {
      companyId: company.id,
      voucherNumber,
      id: {
        not: receiptId,
      },
    },
  });

    if (usedByAi || usedByManual) {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
      );
    }

    try {
      await tx.voucherNumberReservation.create({
        data: {
          companyId: company.id,
          voucherNumber,
          sourceType: "MANUAL_RECEIPT",
          sourceId: receiptId,
        },
      });
    } catch {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} var tekið af öðrum notanda á sama tíma. Reyndu aftur.`
      );
    }

    await tx.receiptEntry.createMany({
      data: bookingEntries.map((entry) => ({
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
        receiptId,
      })),
    });

    await tx.receipt.update({
      where: {
        id: receiptId,
      },
      data: {
        voucherNumber,
        status: "APPROVED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: company.id,
        userId: user.id,
        entityType: "Receipt",
        entityId: receiptId,
        action: "BOOK_RECEIPT",
        source: "USER",
        description: `Fylgiskjal ${voucherNumber} bókað.`,
        afterData: {
          status: "APPROVED",
          voucherNumber,
        },
        metadata: {
          bookingMethod: "MANUAL_RECEIPT",
          receiptId,
          voucherNumber,
          merchantName: receipt.merchantName,
          receiptNumber: receipt.receiptNumber,
          documentDate: receipt.date?.toISOString() ?? null,
          totalAmount: receipt.amount,
          bookingEntries: bookingEntries.map((entry) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
          })),
        },
      },
    });

    if (
      receipt.voucherNumber != null &&
      voucherNumber >= company.nextVoucherNumber
    ) {
      await tx.company.update({
        where: { id: company.id },
        data: { nextVoucherNumber: voucherNumber + 1 },
      });
    }
});
  await archiveReceiptFile(receiptId);

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}
 

export async function updateDetectedDocumentEntries(
  documentId: number,
  entries: {
    id: number;
    account: string;
    text: string;
    debit: number;
    credit: number;
  }[],
  documentDate: string,
  documentAmount: string
) {
  const companyId = await requireActiveCompanyWriteAccess();

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const document = await prisma.aiDetectedDocument.findFirst({
    where: {
      id: documentId,
      receipt: {
        companyId,
      },
    },
    include: {
      bookingEntries: true,
      receipt: {
        include: {
          company: {
            include: {
              accounts: {
                where: {
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt) {
    throw new Error(
      "Ekki er hægt að breyta fylgiskjali eftir samþykkt."
    );
  }

  const allowedAccounts = new Set(
    document.receipt.company.accounts.map(
      (account) => account.number
    )
  );

  const existingEntryIds = new Set(
    document.bookingEntries.map((entry) => entry.id)
  );

  for (const entry of entries) {
    if (!existingEntryIds.has(entry.id)) {
      throw new Error(
        "Bókunarlína tilheyrir ekki þessu fylgiskjali."
      );
    }

    if (!allowedAccounts.has(entry.account)) {
      throw new Error(
        `Reikningslykill ${entry.account} er ekki í reikningslykli fyrirtækisins.`
      );
    }

    if (
      !Number.isFinite(entry.debit) ||
      !Number.isFinite(entry.credit) ||
      entry.debit < 0 ||
      entry.credit < 0
    ) {
      throw new Error(
        "Debet og kredit verða að vera gildar jákvæðar tölur."
      );
    }
  }

  const totalDebit = entries.reduce(
    (sum, entry) => sum + entry.debit,
    0
  );

  const totalCredit = entries.reduce(
    (sum, entry) => sum + entry.credit,
    0
  );

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      "Bókunin stemmir ekki. Samtala debet og kredit verður að vera jöfn."
    );
  }

  const parsedAmount =
    documentAmount.trim() === ""
      ? null
      : Number(documentAmount);

  if (
    parsedAmount !== null &&
    (!Number.isFinite(parsedAmount) || parsedAmount < 0)
  ) {
    throw new Error("Upphæð fylgiskjals er ekki gild.");
  }

  const normalizedDocumentDate = documentDate.trim();

  const parsedDate =
    normalizedDocumentDate === ""
      ? null
      : new Date(`${normalizedDocumentDate}T12:00:00.000Z`);

  if (
    parsedDate !== null &&
    Number.isNaN(parsedDate.getTime())
  ) {
    throw new Error("Dagsetning fylgiskjals er ekki gild.");
  }

  const previousDate = document.date
    ? document.date.toISOString().slice(0, 10)
    : null;

  const nextDate = parsedDate
    ? parsedDate.toISOString().slice(0, 10)
    : null;

  const previousEntries = [...document.bookingEntries]
    .sort((a, b) => a.id - b.id)
    .map((entry) => ({
      id: entry.id,
      account: entry.account,
      text: entry.text,
      debit: entry.debit,
      credit: entry.credit,
    }));

  const nextEntries = [...entries]
    .sort((a, b) => a.id - b.id)
    .map((entry) => ({
      id: entry.id,
      account: entry.account,
      text: entry.text,
      debit: entry.debit,
      credit: entry.credit,
    }));

  const dateChanged = previousDate !== nextDate;
  const amountChanged = document.totalAmount !== parsedAmount;
  const entriesChanged =
    JSON.stringify(previousEntries) !== JSON.stringify(nextEntries);

  const changedFields: string[] = [];

  if (dateChanged) {
    changedFields.push("date");
  }

  if (amountChanged) {
    changedFields.push("totalAmount");
  }

  if (entriesChanged) {
    changedFields.push("bookingEntries");
  }

  if (changedFields.length === 0) {
    revalidatePath(`/fylgiskjol/${document.receiptId}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.aiDetectedDocument.update({
      where: {
        id: documentId,
      },
      data: {
        date: parsedDate,
        totalAmount: parsedAmount,
      },
    });

    for (const entry of entries) {
      await tx.aiDetectedDocumentEntry.update({
        where: {
          id: entry.id,
        },
        data: {
          account: entry.account,
          text: entry.text,
          debit: entry.debit,
          credit: entry.credit,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action: "UPDATE_BOOKING_PROPOSAL",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: "Bókunartillögu fylgiskjals breytt.",
        beforeData: {
          date: previousDate,
          totalAmount: document.totalAmount,
          bookingEntries: previousEntries,
        },
        afterData: {
          date: nextDate,
          totalAmount: parsedAmount,
          bookingEntries: nextEntries,
        },
        metadata: {
          editMethod: "AI_DOCUMENT",
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          changedFields,
        },
      },
    });
  });

  revalidatePath(
    `/fylgiskjol/${document.receiptId}`
  );
}
 export async function addDetectedDocumentEntry(documentId: number) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      receiptId: true,
      approvedAt: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt) {
    throw new Error("Ekki er hægt að breyta fylgiskjali eftir bókun.");
  }

  await prisma.aiDetectedDocumentEntry.create({
    data: {
      documentId,
      account: "",
      text: "",
      debit: 0,
      credit: 0,
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
}
export async function deleteDetectedDocumentEntry(entryId: number) {
  await requireActiveCompanyWriteAccess();
  const entry = await prisma.aiDetectedDocumentEntry.findUnique({
    where: {
      id: entryId,
    },
    include: {
      document: {
        select: {
          receiptId: true,
          approvedAt: true,
        },
      },
    },
  });

  if (!entry) {
    throw new Error("Bókunarlína fannst ekki.");
  }

  if (entry.document.approvedAt) {
    throw new Error("Ekki er hægt að breyta fylgiskjali eftir bókun.");
  }

  await prisma.aiDetectedDocumentEntry.delete({
    where: {
      id: entryId,
    },
  });

  revalidatePath(`/fylgiskjol/${entry.document.receiptId}`);
}
export async function deleteDetectedDocument(documentId: number) {
  const companyId = await requireActiveCompanyWriteAccess();
await requireCompanyDeleteAccess(companyId);
  const document = await prisma.aiDetectedDocument.findFirst({
  where: {
    id: documentId,
    receipt: {
      companyId,
    },
  },
});

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt || document.voucherNumber) {
    throw new Error(
      "Ekki er hægt að eyða greindu fylgiskjali sem hefur þegar verið bókað."
    );
  }

  await prisma.aiDetectedDocument.delete({
    where: {
      id: documentId,
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}
export async function cancelManualReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  await prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: {
        id: receiptId,
      },
      include: {
        aiDetectedDocuments: true,
      },
    });

    if (!receipt) {
      throw new Error("Fylgiskjal fannst ekki.");
    }

    if (receipt.voucherNumber == null) {
      throw new Error("Fylgiskjalið er ekki með fylgiskjalsnúmer.");
    }

    const hasApprovedAiDocument =
      receipt.aiDetectedDocuments.some(
        (document) => document.approvedAt !== null
      );

    if (hasApprovedAiDocument) {
      throw new Error(
        "Ekki er hægt að afbóka AI-bókað fylgiskjal með þessari aðgerð."
      );
    }

    const releasedVoucherNumber = receipt.voucherNumber;
const company = await tx.company.findUnique({
  where: {
    id: receipt.companyId,
  },
  select: {
    nextVoucherNumber: true,
  },
});

if (!company) {
  throw new Error("Fyrirtæki fannst ekki.");
}
    await tx.receipt.update({
  where: {
    id: receiptId,
  },
  data: {
    voucherNumber: null,
    status: "CANCELLED",
    ocrStatus: `Afbókuð handvirk bókun. Fylgiskjalsnúmer ${releasedVoucherNumber} losað.`,
  },
});

if (company.nextVoucherNumber === releasedVoucherNumber + 1) {
  await tx.company.update({
    where: {
      id: receipt.companyId,
    },
    data: {
      nextVoucherNumber: releasedVoucherNumber,
    },
  });
}

});
  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
}
export async function deleteReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
      entries: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  // Ekki má eyða fylgiskjali sem hefur verið bókað
  const hasApprovedDocument = receipt.aiDetectedDocuments.some(
    (document) => document.approvedAt !== null
  );

  if (hasApprovedDocument || receipt.status === "APPROVED") {
    throw new Error(
      "Ekki er hægt að eyða fylgiskjali sem hefur þegar verið bókað."
    );
  }

  await prisma.receipt.delete({
    where: {
      id: receiptId,
    },
  });
  revalidatePath("/fylgiskjol");
}
  export async function markReceiptReviewed(receiptId: number) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
    throw new Error("Ekki er hægt að breyta bókuðu fylgiskjali.");
  }

  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "REVIEWED",
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/stjornbord");
}

export async function markReceiptNeedsAttention(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
    throw new Error("Ekki er hægt að breyta bókuðu fylgiskjali.");
  }

  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/stjornbord");
}

export async function repairDeleteLegacyReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  const hasVoucherNumber = receipt.aiDetectedDocuments.some(
    (document) => document.voucherNumber !== null
  );

  if (hasVoucherNumber) {
    throw new Error(
      "Ekki má nota viðgerðar-eyðingu á fylgiskjal sem hefur fengið fylgiskjalsnúmer."
    );
  }

  const hasLegacyApprovedDocuments = receipt.aiDetectedDocuments.some(
    (document) =>
      document.approvedAt !== null && document.voucherNumber === null
  );

  if (!hasLegacyApprovedDocuments) {
    throw new Error(
      "Þetta fylgiskjal er ekki í gamla ónúmeraða bókunarástandinu."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.receiptEntry.deleteMany({
      where: {
        receiptId,
      },
    });

    await tx.aiDetectedDocument.deleteMany({
      where: {
        receiptId,
      },
    });

    await tx.receipt.delete({
      where: {
        id: receiptId,
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/fylgiskjol");
}