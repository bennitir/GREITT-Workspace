import OpenAI from "openai";
import { createReadStream, existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase";

export type InsightDocumentType =
  | "ACCOUNTING_DOCUMENT"
  | "CREDIT_NOTE"
  | "PAYMENT_NOTICE"
  | "PAYMENT_CONFIRMATION"
  | "STATEMENT"
  | "OFFER"
  | "CONTRACT"
  | "INFORMATION"
  | "UNKNOWN";

export type InsightDocumentRole =
  | "BOOKABLE"
  | "SUPPORTING"
  | "INSIGHT_SOURCE"
  | "REVIEW";

export type InsightCompanyContext = {
  name: string;
  vatNumber?: string | null;
  vatRegistered?: boolean | null;
  rskRegisteredActivities?: string | null;
  activeActivities?: string | null;
};

export type InsightExistingDocumentContext = {
  documentId?: number | null;
  pageNumber?: number | null;
  merchantName?: string | null;
  merchantKennitala?: string | null;
  date?: Date | string | null;
  receiptNumber?: string | null;
  totalAmount?: number | null;
  summary?: string | null;
  documentType?: string | null;
  documentRole?: string | null;
};

export type AnalyzeInsightDocumentInput = {
  filePath: string;
  storagePath?: string | null;
  company: InsightCompanyContext;
  existingDocument?: InsightExistingDocumentContext | null;
  processingVersion: string;
};

export type InsightDetectedEntity = {
  entityType: string;
  name: string;
  identifierType: string | null;
  identifierValue: string | null;
  role: string;
  confidence: number;
};

export type InsightDetectedFact = {
  factType: string;
  label: string;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  unit: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  confidence: number;
};

export type InsightFinancialEventCandidate = {
  eventType: string;
  description: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
};

export type InsightDocumentAnalysisResult = {
  processingVersion: string;

  document: {
    merchantName: string | null;
    merchantKennitala: string | null;
    date: string | null;
    receiptNumber: string | null;
    totalAmount: number | null;
    pageNumber: number | null;
    summary: string;
    documentType: InsightDocumentType;
    documentRole: InsightDocumentRole;
    classificationConfidence: number;
  };

  entities: InsightDetectedEntity[];

  facts: InsightDetectedFact[];

  financialEventCandidate:
    | InsightFinancialEventCandidate
    | null;

  usage: {
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

const MODEL = "gpt-5.6";

function resolvePublicFilePath(filePath: string) {
  const trimmed = filePath.trim();

  if (!trimmed) {
    throw new Error(
      "Slóð á frumskjal vantar fyrir Innsýn-greiningu.",
    );
  }

  /*
   * Styðjum líka raunverulega Windows-slóð ef slíkt verður
   * síðar notað innan server-vinnslu.
   */
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }

  /*
   * Receipt.filePath er í dag t.d.
   * /uploads/123456-skjal.pdf
   *
   * Sú slóð er vefslóð miðað við public/, ekki
   * absolute filesystem-slóð.
   */
  const relativePath = trimmed.replace(
    /^[\\/]+/,
    "",
  );

  return path.join(
    process.cwd(),
    "public",
    relativePath,
  );
}

type PreparedInsightSource = {
  fullPath: string;
  source: "LOCAL" | "SUPABASE";
};

async function prepareInsightSource(
  filePath: string,
  storagePath?: string | null,
): Promise<PreparedInsightSource> {
  const localPath = resolvePublicFilePath(filePath);

  if (existsSync(localPath)) {
    return { fullPath: localPath, source: "LOCAL" };
  }

  const persistentStoragePath = storagePath?.trim();

  if (!persistentStoragePath) {
    throw new Error(
      "Frumskjal fannst ekki á local diski og storagePath vantar fyrir Supabase Storage.",
    );
  }

  const { data, error } = await supabaseAdmin.storage
    .from("fylgiskjol")
    .download(persistentStoragePath);

  if (error || !data) {
    throw new Error(
      `Ekki tókst að sækja frumskjal úr Supabase Storage: ${error?.message ?? "Óþekkt villa"}`,
    );
  }

  const tempDir = path.join(os.tmpdir(), "gloggt-insight");
  await mkdir(tempDir, { recursive: true });

  const rawName = path.basename(persistentStoragePath) || path.basename(filePath) || "insight-source.bin";
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "_");
  const tempPath = path.join(
    tempDir,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`,
  );

  await writeFile(tempPath, Buffer.from(await data.arrayBuffer()));

  return { fullPath: tempPath, source: "SUPABASE" };
}

function formatExistingDate(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return "Ekki skráð";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "Ekki skráð";
    }

    return value.toISOString().slice(0, 10);
  }

  return value;
}

function buildExistingDocumentContext(
  document:
    | InsightExistingDocumentContext
    | null
    | undefined,
) {
  if (!document) {
    return `
Ekki er verið að beina lestrinum að einu áður greindu skjali.
Lestu frumskjalið sjálft og greindu meginefni þess.
`;
  }

  return `
GLÖGGT hefur áður greint skjal innan þessa frumskjals.

Þetta eru FYRRI gögn eingöngu til að hjálpa þér að finna rétta skjalið.
Þau mega ekki yfirskrifa það sem raunverulega sést á frumskjalinu.

Document ID: ${document.documentId ?? "Ekki skráð"}
Síða: ${document.pageNumber ?? "Ekki skráð"}
Aðili: ${document.merchantName ?? "Ekki skráð"}
Kennitala aðila: ${document.merchantKennitala ?? "Ekki skráð"}
Dagsetning: ${formatExistingDate(document.date)}
Reiknings-/skjalanúmer: ${document.receiptNumber ?? "Ekki skráð"}
Upphæð: ${document.totalAmount ?? "Ekki skráð"}
Fyrri skjalategund: ${document.documentType ?? "Ekki skráð"}
Fyrra skjalahlutverk: ${document.documentRole ?? "Ekki skráð"}
Fyrri samantekt:
${document.summary ?? "Ekki skráð"}

Ef pageNumber er til staðar skaltu fyrst og fremst greina
skjalið sem er á þeirri síðu eða byrjar á þeirri síðu.

Fyrri gögn geta verið röng.
Frumskjalið sjálft er heimildin.
`;
}

function buildCompanyContext(
  company: InsightCompanyContext,
) {
  const vatStatus =
    company.vatRegistered === true
      ? "Já, VSK-skráð"
      : company.vatRegistered === false
        ? "Nei, ekki VSK-skráð"
        : "Ekki staðfest";

  return `
Fyrirtækið sem gögnin tilheyra:

Nafn: ${company.name}
VSK-númer: ${company.vatNumber ?? "Ekki skráð"}
VSK-skráningarstaða: ${vatStatus}
RSK-skráð starfsemi:
${company.rskRegisteredActivities ?? "Ekki skráð"}

Virk starfsemi:
${company.activeActivities ?? "Ekki staðfest"}
`;
}

function ensureConfidence(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, value),
  );
}

function normalizeResult(
  raw: unknown,
  processingVersion: string,
  usage: InsightDocumentAnalysisResult["usage"],
): InsightDocumentAnalysisResult {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    throw new Error(
      "Ógilt svar kom frá Innsýn-greiningu.",
    );
  }

  const result = raw as Record<
    string,
    unknown
  >;

  const document =
    result.document as
      | Record<string, unknown>
      | undefined;

  if (
    !document ||
    typeof document !== "object"
  ) {
    throw new Error(
      "Innsýn-greining skilaði ekki skjalaniðurstöðu.",
    );
  }

  const documentType =
    document.documentType;

  const documentRole =
    document.documentRole;

  const validDocumentTypes =
    new Set<InsightDocumentType>([
      "ACCOUNTING_DOCUMENT",
      "CREDIT_NOTE",
      "PAYMENT_NOTICE",
      "PAYMENT_CONFIRMATION",
      "STATEMENT",
      "OFFER",
      "CONTRACT",
      "INFORMATION",
      "UNKNOWN",
    ]);

  const validDocumentRoles =
    new Set<InsightDocumentRole>([
      "BOOKABLE",
      "SUPPORTING",
      "INSIGHT_SOURCE",
      "REVIEW",
    ]);

  if (
    typeof documentType !== "string" ||
    !validDocumentTypes.has(
      documentType as InsightDocumentType,
    )
  ) {
    throw new Error(
      "Innsýn-greining skilaði ógildri skjalategund.",
    );
  }

  if (
    typeof documentRole !== "string" ||
    !validDocumentRoles.has(
      documentRole as InsightDocumentRole,
    )
  ) {
    throw new Error(
      "Innsýn-greining skilaði ógildu skjalahlutverki.",
    );
  }

  if (
    typeof document.summary !== "string"
  ) {
    throw new Error(
      "Innsýn-greining skilaði ekki samantekt.",
    );
  }

  const rawEntities =
    Array.isArray(result.entities)
      ? result.entities
      : [];

  const entities: InsightDetectedEntity[] =
    rawEntities
      .filter(
        (
          value,
        ): value is Record<
          string,
          unknown
        > =>
          !!value &&
          typeof value === "object",
      )
      .map((entity) => ({
        entityType:
          typeof entity.entityType ===
          "string"
            ? entity.entityType
            : "UNKNOWN",

        name:
          typeof entity.name === "string"
            ? entity.name
            : "Óþekkt eining",

        identifierType:
          typeof entity.identifierType ===
          "string"
            ? entity.identifierType
            : null,

        identifierValue:
          typeof entity.identifierValue ===
          "string"
            ? entity.identifierValue
            : null,

        role:
          typeof entity.role === "string"
            ? entity.role
            : "RELATED",

        confidence:
          ensureConfidence(
            entity.confidence,
          ),
      }));

  const rawFacts =
    Array.isArray(result.facts)
      ? result.facts
      : [];

  const facts: InsightDetectedFact[] =
    rawFacts
      .filter(
        (
          value,
        ): value is Record<
          string,
          unknown
        > =>
          !!value &&
          typeof value === "object",
      )
      .map((fact) => ({
        factType:
          typeof fact.factType === "string"
            ? fact.factType
            : "OTHER",

        label:
          typeof fact.label === "string"
            ? fact.label
            : "Upplýsing",

        valueText:
          typeof fact.valueText ===
          "string"
            ? fact.valueText
            : null,

        valueNumber:
          typeof fact.valueNumber ===
            "number" &&
          Number.isFinite(fact.valueNumber)
            ? fact.valueNumber
            : null,

        valueDate:
          typeof fact.valueDate ===
          "string"
            ? fact.valueDate
            : null,

        unit:
          typeof fact.unit === "string"
            ? fact.unit
            : null,

        periodStart:
          typeof fact.periodStart ===
          "string"
            ? fact.periodStart
            : null,

        periodEnd:
          typeof fact.periodEnd ===
          "string"
            ? fact.periodEnd
            : null,

        confidence:
          ensureConfidence(
            fact.confidence,
          ),
      }));

  let financialEventCandidate:
    | InsightFinancialEventCandidate
    | null = null;

  const rawFinancialEvent =
    result.financialEventCandidate;

  if (
    rawFinancialEvent &&
    typeof rawFinancialEvent === "object"
  ) {
    const event =
      rawFinancialEvent as Record<
        string,
        unknown
      >;

    financialEventCandidate = {
      eventType:
        typeof event.eventType === "string"
          ? event.eventType
          : "UNKNOWN",

      description:
        typeof event.description ===
        "string"
          ? event.description
          : "Ótilgreindur fjárhagsatburður",

      date:
        typeof event.date === "string"
          ? event.date
          : null,

      amount:
        typeof event.amount === "number" &&
        Number.isFinite(event.amount)
          ? event.amount
          : null,

      currency:
        typeof event.currency === "string"
          ? event.currency
          : null,

      confidence:
        ensureConfidence(
          event.confidence,
        ),
    };
  }

  return {
    processingVersion,

    document: {
      merchantName:
        typeof document.merchantName ===
        "string"
          ? document.merchantName
          : null,

      merchantKennitala:
        typeof document.merchantKennitala ===
        "string"
          ? document.merchantKennitala
          : null,

      date:
        typeof document.date === "string"
          ? document.date
          : null,

      receiptNumber:
        typeof document.receiptNumber ===
        "string"
          ? document.receiptNumber
          : null,

      totalAmount:
        typeof document.totalAmount ===
          "number" &&
        Number.isFinite(
          document.totalAmount,
        )
          ? document.totalAmount
          : null,

      pageNumber:
        typeof document.pageNumber ===
          "number" &&
        Number.isFinite(
          document.pageNumber,
        )
          ? document.pageNumber
          : null,

      summary: document.summary,

      documentType:
        documentType as InsightDocumentType,

      documentRole:
        documentRole as InsightDocumentRole,

      classificationConfidence:
        ensureConfidence(
          document.classificationConfidence,
        ),
    },

    entities,
    facts,
    financialEventCandidate,
    usage,
  };
}

export async function analyzeDocumentForInsight(
  input: AnalyzeInsightDocumentInput,
): Promise<InsightDocumentAnalysisResult> {
  const processingVersion =
    input.processingVersion.trim();

  if (!processingVersion) {
    throw new Error(
      "processingVersion vantar fyrir Innsýn-greiningu.",
    );
  }

  if (
    !process.env.OPENAI_API_KEY
  ) {
    throw new Error(
      "OPENAI_API_KEY vantar á server.",
    );
  }

  const preparedSource =
    await prepareInsightSource(
      input.filePath,
      input.storagePath,
    );

  const fullPath = preparedSource.fullPath;

  const extension = path
    .extname(fullPath)
    .toLowerCase();

  const isImage = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ].includes(extension);

  const openai = new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
    timeout: 60 * 1000,
    maxRetries: 0,
  });

  let uploadedFileId:
    | string
    | null = null;

  let imageDataUrl:
    | string
    | null = null;

  if (isImage) {
    const imageBuffer =
      await readFile(fullPath);

    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";

    imageDataUrl =
      `data:${mimeType};base64,${imageBuffer.toString(
        "base64",
      )}`;
  } else {
    const uploadedFile =
      await openai.files.create({
        file: createReadStream(
          fullPath,
        ),
        purpose: "user_data",
      });

    uploadedFileId =
      uploadedFile.id;
  }

  const existingDocumentText =
    buildExistingDocumentContext(
      input.existingDocument,
    );

  const companyText =
    buildCompanyContext(
      input.company,
    );

  const response =
    await openai.responses.create({
      model: MODEL,

      input: [
        {
          role: "user",

          content: [
            ...(isImage &&
            imageDataUrl
              ? [
                  {
                    type: "input_image" as const,
                    image_url:
                      imageDataUrl,
                    detail:
                      "auto" as const,
                  },
                ]
              : uploadedFileId
                ? [
                    {
                      type: "input_file" as const,
                      file_id:
                        uploadedFileId,
                    },
                  ]
                : []),

            {
              type: "input_text",

              text: `
Þú ert Innsýn-lag GLÖGGT.

Lestu frumskjalið vandlega og skilaðu
merkingu þess án þess að framkvæma bókun.

MJÖG MIKILVÆGT:

Þessi greining má EKKI:
- bóka færslu,
- búa til fylgiskjalanúmer,
- breyta fyrri bókun,
- ákveða VSK-meðferð,
- eyða fyrri niðurstöðum,
- merkja skjal endanlega afgreitt,
- eða ákveða faglegt mat fyrir bókara.

Skjalið er upplýsingagjafi.
Bókun er aðeins ein möguleg niðurstaða úr því.

${companyText}

${existingDocumentText}

SKJALAFLOKKUN

documentType skal vera eitt af:

ACCOUNTING_DOCUMENT
CREDIT_NOTE
PAYMENT_NOTICE
PAYMENT_CONFIRMATION
STATEMENT
OFFER
CONTRACT
INFORMATION
UNKNOWN

documentRole skal vera eitt af:

BOOKABLE
SUPPORTING
INSIGHT_SOURCE
REVIEW

BOOKABLE:
Skjalið virðist sjálft vera fullnægjandi
frumheimild fyrir bókhaldslegan atburð.

SUPPORTING:
Skjalið styður, staðfestir eða lýsir öðrum
undirliggjandi fjárhagsatburði og má ekki
sjálfkrafa búa til nýjan kostnað eða tekjuatburð.

PAYMENT_CONFIRMATION sem aðeins staðfestir
greiðslu annars atburðar skal almennt vera
SUPPORTING.

INSIGHT_SOURCE:
Skjalið inniheldur verðmætar upplýsingar fyrir
Innsýn, rekjanleika eða rekstrargreiningu en er
ekki sjálft skýr bókunarheimild.

Dæmi geta verið:
- tilboð,
- samningar,
- tryggingaskilmálar,
- upplýsingar um eign,
- mæligildi,
- þjónustutímabil,
- verð og skilmálar.

REVIEW:
Mannlegt mat þarf áður en hægt er að ákvarða
hlutverk skjalsins með nægri vissu.

STAÐREYNDIR

Finndu staðreyndir sem raunverulega koma fram
á skjalinu.

Ekki giska.

Dæmi:
- magn,
- km,
- kWh,
- lítrar,
- einingarverð,
- tryggingavernd,
- sjálfsábyrgð,
- tímabil,
- lánsnúmer,
- höfuðstóll,
- vextir,
- verðbætur,
- gjöld,
- eignarauðkenni,
- samningsnúmer,
- þjónustunúmer.

factType skal vera stutt stöðugt vélheiti,
t.d.:

QUANTITY
DISTANCE
ENERGY
UNIT_PRICE
LOAN_NUMBER
LOAN_PRINCIPAL
INTEREST
INDEXATION
FEE
COVERAGE
DEDUCTIBLE
PERIOD
ASSET_IDENTIFIER
CONTRACT_NUMBER
SERVICE_IDENTIFIER
OTHER

label skal vera læsilegt heiti staðreyndarinnar.

Aðeins eitt af valueText, valueNumber eða
valueDate þarf að innihalda megingildið.
Hin mega vera null.

ENTITIES

Finndu aðila/einingar sem raunverulega koma fram.

Dæmi:
- fyrirtæki,
- einstaklingur,
- lán,
- ökutæki,
- fasteign,
- trygging,
- samningur,
- reikningur eða þjónusta.

entityType skal vera stutt stöðugt vélheiti.

identifierType og identifierValue skulu aðeins
vera fyllt ef auðkennið sést raunverulega.

Ekki álykta um persónulega eða viðkvæma
eiginleika fólks.

FINANCIAL EVENT

financialEventCandidate á aðeins að vera fyllt
ef skjalið gefur skýra vísbendingu um
fjárhagsatburð sem hægt gæti verið að tengja
við önnur skjöl.

Það þýðir EKKI að atburðurinn eigi að bókast
aftur.

Til dæmis geta:
- reikningur,
- greiðsluseðill,
- greiðslustaðfesting,
- bankahreyfing

öll lýst sama fjárhagsatburðinum.

Ef ekki er nægilega skýr fjárhagsatburður skal
financialEventCandidate vera null.

DAGSETNINGAR

Íslenskar dagsetningar skulu lesnar sem
DAGUR.MÁNUÐUR.ÁR.

Skilaðu dagsetningum sem YYYY-MM-DD.

Ekki breyta eða giska á ár.

Ef dagsetning er óviss skal skila null.

UPPHÆÐIR OG NÚMER

Finndu aðeins tölur sem raunverulega sjást.

Ekki túlka:
- fylgiskjalsnúmer,
- handskrifuð bókhaldsnúmer,
- reikningslykla

sem dagsetningar eða upphæðir nema skjalið
styðji það skýrt.

SAMANTEKT

summary skal varðveita mikilvæga merkingu
skjalsins.

Varðveittu sérstaklega gagnleg atriði jafnvel
þótt þau séu ekki nauðsynleg fyrir bókun.

Þessi greining er Innsýn.
Hún má greina og útskýra.
Hún má ekki framkvæma bókun.
`,
            },
          ],
        },
      ],

      text: {
        format: {
          type: "json_schema",
          name: "insight_document_analysis",
          strict: true,

          schema: {
            type: "object",

            properties: {
              document: {
                type: "object",

                properties: {
                  merchantName: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  merchantKennitala: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  date: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  receiptNumber: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  totalAmount: {
                    type: [
                      "number",
                      "null",
                    ],
                  },

                  pageNumber: {
                    type: [
                      "number",
                      "null",
                    ],
                  },

                  summary: {
                    type: "string",
                  },

                  documentType: {
                    type: "string",

                    enum: [
                      "ACCOUNTING_DOCUMENT",
                      "CREDIT_NOTE",
                      "PAYMENT_NOTICE",
                      "PAYMENT_CONFIRMATION",
                      "STATEMENT",
                      "OFFER",
                      "CONTRACT",
                      "INFORMATION",
                      "UNKNOWN",
                    ],
                  },

                  documentRole: {
                    type: "string",

                    enum: [
                      "BOOKABLE",
                      "SUPPORTING",
                      "INSIGHT_SOURCE",
                      "REVIEW",
                    ],
                  },

                  classificationConfidence: {
                    type: "number",
                  },
                },

                required: [
                  "merchantName",
                  "merchantKennitala",
                  "date",
                  "receiptNumber",
                  "totalAmount",
                  "pageNumber",
                  "summary",
                  "documentType",
                  "documentRole",
                  "classificationConfidence",
                ],

                additionalProperties:
                  false,
              },

              entities: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    entityType: {
                      type: "string",
                    },

                    name: {
                      type: "string",
                    },

                    identifierType: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    identifierValue: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    role: {
                      type: "string",
                    },

                    confidence: {
                      type: "number",
                    },
                  },

                  required: [
                    "entityType",
                    "name",
                    "identifierType",
                    "identifierValue",
                    "role",
                    "confidence",
                  ],

                  additionalProperties:
                    false,
                },
              },

              facts: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    factType: {
                      type: "string",
                    },

                    label: {
                      type: "string",
                    },

                    valueText: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    valueNumber: {
                      type: [
                        "number",
                        "null",
                      ],
                    },

                    valueDate: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    unit: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    periodStart: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    periodEnd: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    confidence: {
                      type: "number",
                    },
                  },

                  required: [
                    "factType",
                    "label",
                    "valueText",
                    "valueNumber",
                    "valueDate",
                    "unit",
                    "periodStart",
                    "periodEnd",
                    "confidence",
                  ],

                  additionalProperties:
                    false,
                },
              },

              financialEventCandidate: {
                type: [
                  "object",
                  "null",
                ],

                properties: {
                  eventType: {
                    type: "string",
                  },

                  description: {
                    type: "string",
                  },

                  date: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  amount: {
                    type: [
                      "number",
                      "null",
                    ],
                  },

                  currency: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  confidence: {
                    type: "number",
                  },
                },

                required: [
                  "eventType",
                  "description",
                  "date",
                  "amount",
                  "currency",
                  "confidence",
                ],

                additionalProperties:
                  false,
              },
            },

            required: [
              "document",
              "entities",
              "facts",
              "financialEventCandidate",
            ],

            additionalProperties: false,
          },
        },
      },
    });

  const inputTokens =
    response.usage?.input_tokens ?? 0;

  const cachedInputTokens =
    response.usage
      ?.input_tokens_details
      ?.cached_tokens ?? 0;

  const outputTokens =
    response.usage?.output_tokens ?? 0;

  const totalTokens =
    response.usage?.total_tokens ?? 0;

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      response.output_text,
    );
  } catch {
    throw new Error(
      "Ekki tókst að lesa JSON-svar frá Innsýn.",
    );
  }

  return normalizeResult(
    parsed,
    processingVersion,
    {
      model: MODEL,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
    },
  );
}
