export type VatTreatment =
  | "OUTPUT"
  | "INPUT"
  | "EXEMPT"
  | "NONE"
  | "REVIEW"
  | "SYSTEM";

export type DefaultAccount = {
  number: string;
  name: string;
  type: string;
  entryRole: string;

  // VSK-reglur
  vatRate?: number;
  vatAccount?: string;
  vatCode?: string;
  vatTreatment?: VatTreatment;
  vatDeductiblePercent?: number;
  vatRequiresConfirmation?: boolean;
};

/*
 * Almennur kostnaðarreikningur með 24% VSK.
 *
 * Þetta þýðir ekki sjálfkrafa að sérhver færsla eigi alltaf
 * fullan innskattsrétt. Reikningar sem geta verið háðir notkun
 * eða öðrum aðstæðum eru merktir sérstaklega með
 * vatRequiresConfirmation.
 */
const expense24 = (
  number: string,
  name: string,
  vatRequiresConfirmation = false
): DefaultAccount => ({
  number,
  name,
  type: "OPERATING_EXPENSE",
  entryRole: "EXPENSE",

  vatRate: 24,
  vatAccount: "2520",
  vatCode: "INPUT_24",
  vatTreatment: "INPUT",

  vatDeductiblePercent: vatRequiresConfirmation
    ? undefined
    : 100,

  vatRequiresConfirmation,
});

/*
 * Kostnaðarreikningur þar sem GLÖGGT á ekki að ákveða
 * VSK-meðferð sjálfkrafa.
 */
const reviewExpense = (
  number: string,
  name: string,
  type = "OPERATING_EXPENSE"
): DefaultAccount => ({
  number,
  name,
  type,
  entryRole: "EXPENSE",

  vatTreatment: "REVIEW",
  vatRequiresConfirmation: true,
});

/*
 * Reikningur án VSK-meðferðar.
 */
const noVatAccount = (
  number: string,
  name: string,
  type: string,
  entryRole: string
): DefaultAccount => ({
  number,
  name,
  type,
  entryRole,

  vatCode: "NO_VAT",
  vatTreatment: "NONE",
  vatDeductiblePercent: 0,
  vatRequiresConfirmation: false,
});

export const defaultAccounts: DefaultAccount[] = [
  /*
   * Eignir og greiðslureikningar
   */

  noVatAccount(
    "1000",
    "Sjóður",
    "CASH",
    "PAYMENT"
  ),

  noVatAccount(
    "1510",
    "Banki",
    "BANK",
    "PAYMENT"
  ),

  noVatAccount(
    "1600",
    "Viðskiptakröfur",
    "ACCOUNTS_RECEIVABLE",
    "GENERAL"
  ),

  /*
   * Skuldir
   */

  noVatAccount(
    "2000",
    "Viðskiptaskuldir",
    "ACCOUNTS_PAYABLE",
    "PAYMENT"
  ),

  noVatAccount(
    "2100",
    "Skammtímalán",
    "SHORT_TERM_LIABILITY",
    "GENERAL"
  ),

  noVatAccount(
    "2200",
    "Langtímalán",
    "LONG_TERM_LIABILITY",
    "GENERAL"
  ),

  noVatAccount(
    "2210",
    "Bankalán",
    "LONG_TERM_LIABILITY",
    "GENERAL"
  ),

  noVatAccount(
    "2220",
    "Fjármögnun og tækjalán",
    "LONG_TERM_LIABILITY",
    "GENERAL"
  ),

  /*
   * VSK-kerfisreikningar
   */

  {
    number: "2510",
    name: "Útskattur",
    type: "VAT_OUTPUT",
    entryRole: "SYSTEM",

    vatCode: "VAT_OUTPUT",
    vatTreatment: "SYSTEM",
    vatRequiresConfirmation: false,
  },

  {
    number: "2520",
    name: "Innskattur",
    type: "VAT_INPUT",
    entryRole: "SYSTEM",

    vatCode: "VAT_INPUT",
    vatTreatment: "SYSTEM",
    vatRequiresConfirmation: false,
  },

  {
    number: "2590",
    name: "Uppgjörsreikningur VSK",
    type: "VAT_SETTLEMENT",
    entryRole: "SYSTEM",

    vatCode: "VAT_SETTLEMENT",
    vatTreatment: "SYSTEM",
    vatRequiresConfirmation: false,
  },

  /*
   * Laun og opinber gjöld
   */

  noVatAccount(
    "2550",
    "Staðgreiðsla launa",
    "PAYROLL_LIABILITY",
    "SYSTEM"
  ),

  /*
   * Tekjur
   *
   * 3000 er áfram almenni 24% sölureikningurinn.
   * Síðar getum við bætt við sérstökum 11% og
   * undanþegnum sölureikningum án þess að breyta
   * VSK-vélinni.
   */

  {
    number: "3000",
    name: "Sölutekjur",
    type: "REVENUE",
    entryRole: "REVENUE",

    vatRate: 24,
    vatAccount: "2510",
    vatCode: "OUTPUT_24",
    vatTreatment: "OUTPUT",
    vatDeductiblePercent: 0,
    vatRequiresConfirmation: false,
  },

  {
    number: "3900",
    name: "Aðrar tekjur",
    type: "OTHER_REVENUE",
    entryRole: "REVENUE",

    vatTreatment: "REVIEW",
    vatRequiresConfirmation: true,
  },

  /*
   * Vörukaup og almennur rekstrarkostnaður
   */

  {
    ...expense24(
      "4000",
      "Vörukaup og aðföng"
    ),
    type: "COST_OF_GOODS",
  },

  expense24(
    "4100",
    "Rekstrarvörur"
  ),

  expense24(
    "4110",
    "Verkfæri og smááhöld"
  ),

  expense24(
    "4120",
    "Tölvu- og skrifstofubúnaður"
  ),

  expense24(
    "4200",
    "Aðkeypt þjónusta"
  ),

  expense24(
    "4210",
    "Bókhalds- og endurskoðunarþjónusta"
  ),

  expense24(
    "4220",
    "Lögfræði- og ráðgjafarþjónusta"
  ),

  expense24(
    "4230",
    "Önnur sérfræðiþjónusta"
  ),

  /*
   * Húsnæði
   */

  expense24(
    "4300",
    "Húsaleiga",
    true
  ),

  expense24(
    "4310",
    "Rafmagn"
  ),

  expense24(
    "4320",
    "Hiti og hitaveita"
  ),

  expense24(
    "4330",
    "Vatn og fráveita"
  ),

  expense24(
    "4340",
    "Viðhald húsnæðis",
    true
  ),

  expense24(
    "4350",
    "Þrif og ræsting"
  ),

  noVatAccount(
    "4360",
    "Fasteignagjöld",
    "OPERATING_EXPENSE",
    "EXPENSE"
  ),

  /*
   * Sími, hugbúnaður og tölvur
   */

  expense24(
    "4400",
    "Sími og fjarskipti"
  ),

  expense24(
    "4410",
    "Internet"
  ),

  expense24(
    "4420",
    "Hugbúnaður og áskriftir"
  ),

  expense24(
    "4430",
    "Rekstur tölvubúnaðar"
  ),

  /*
   * Launakostnaður
   */

  noVatAccount(
    "4500",
    "Laun",
    "PAYROLL_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "4510",
    "Lífeyrissjóður – mótframlag",
    "PAYROLL_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "4530",
    "Tryggingagjald",
    "PAYROLL_EXPENSE",
    "EXPENSE"
  ),

  /*
   * Tryggingar
   */

  noVatAccount(
    "4600",
    "Tryggingar rekstrar",
    "OPERATING_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "4610",
    "Húsnæðis- og lausafjártryggingar",
    "OPERATING_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "4620",
    "Bifreiðatryggingar",
    "OPERATING_EXPENSE",
    "EXPENSE"
  ),

  /*
   * Bifreiðar
   *
   * Hér á GLÖGGT ekki að gera ráð fyrir fullum
   * innskattsrétti án staðfestingar.
   */

  expense24(
    "4700",
    "Bifreiðakostnaður",
    true
  ),

  expense24(
    "4710",
    "Eldsneyti og hleðsla",
    true
  ),

  expense24(
    "4720",
    "Viðgerðir og viðhald bifreiða",
    true
  ),

  expense24(
    "4730",
    "Varahlutir og hjólbarðar",
    true
  ),

  noVatAccount(
    "4740",
    "Bifreiðagjöld",
    "OPERATING_EXPENSE",
    "EXPENSE"
  ),

  expense24(
    "4750",
    "Þrif og annar bifreiðakostnaður",
    true
  ),

  /*
   * Markaðs- og sölukostnaður
   */

  expense24(
    "4800",
    "Markaðs- og sölukostnaður"
  ),

  expense24(
    "4810",
    "Auglýsingar"
  ),

  expense24(
    "4820",
    "Vefur og vefverslun"
  ),

  expense24(
    "4830",
    "Prentun og kynningarefni"
  ),

  /*
   * Almennur kostnaður
   */

  expense24(
    "4900",
    "Almennur rekstrarkostnaður",
    true
  ),

  {
    number: "4910",
    name: "Veitingar",
    type: "OPERATING_EXPENSE",
    entryRole: "EXPENSE",

    vatRate: 11,
    vatAccount: "2520",
    vatCode: "INPUT_11",
    vatTreatment: "REVIEW",
    vatRequiresConfirmation: true,
  },

  expense24(
    "4920",
    "Skrifstofuvörur og ritföng"
  ),

  expense24(
    "4930",
    "Ferðakostnaður",
    true
  ),

  expense24(
    "4940",
    "Námskeið og ráðstefnur",
    true
  ),

  expense24(
    "4950",
    "Félags- og áskriftargjöld",
    true
  ),

  reviewExpense(
    "4960",
    "Annar kostnaður",
    "OTHER_EXPENSE"
  ),

  /*
   * Fjármagnskostnaður
   */

  noVatAccount(
    "4970",
    "Bankakostnaður og þjónustugjöld",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "4980",
    "Greiðslu- og innheimtugjöld",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "5100",
    "Vaxtagjöld",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "5110",
    "Vextir af bankalánum",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "5120",
    "Verðbætur",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),

  noVatAccount(
    "5130",
    "Lántöku- og fjármagnskostnaður",
    "FINANCE_EXPENSE",
    "EXPENSE"
  ),
];

export const accountPromptText = defaultAccounts
  .map(
    (account) =>
      `${account.number} – ${account.name} [${account.type}]`
  )
  .join("\n");