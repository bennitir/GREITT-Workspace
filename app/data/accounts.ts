export type DefaultAccount = {
  number: string;
  name: string;
  type: string;
  entryRole: string;
  vatRate?: number;
  vatAccount?: string;
  vatRequiresConfirmation?: boolean;
};

const expense24 = (number: string, name: string, vatRequiresConfirmation = false): DefaultAccount => ({
  number,
  name,
  type: "OPERATING_EXPENSE",
  entryRole: "EXPENSE",
  vatRate: 24,
  vatAccount: "2520",
  vatRequiresConfirmation,
});

export const defaultAccounts: DefaultAccount[] = [
  { number: "1000", name: "Sjóður", type: "CASH", entryRole: "PAYMENT" },
  { number: "1510", name: "Banki", type: "BANK", entryRole: "PAYMENT" },
  { number: "1600", name: "Viðskiptakröfur", type: "ACCOUNTS_RECEIVABLE", entryRole: "GENERAL" },
  { number: "2000", name: "Viðskiptaskuldir", type: "ACCOUNTS_PAYABLE", entryRole: "PAYMENT" },
  { number: "2100", name: "Skammtímalán", type: "SHORT_TERM_LIABILITY", entryRole: "GENERAL" },
  { number: "2200", name: "Langtímalán", type: "LONG_TERM_LIABILITY", entryRole: "GENERAL" },
  { number: "2210", name: "Bankalán", type: "LONG_TERM_LIABILITY", entryRole: "GENERAL" },
  { number: "2220", name: "Fjármögnun og tækjalán", type: "LONG_TERM_LIABILITY", entryRole: "GENERAL" },
  { number: "2510", name: "Útskattur", type: "VAT_OUTPUT", entryRole: "SYSTEM" },
  { number: "2520", name: "Innskattur", type: "VAT_INPUT", entryRole: "SYSTEM" },
  { number: "2550", name: "Staðgreiðsla launa", type: "PAYROLL_LIABILITY", entryRole: "SYSTEM" },
  { number: "2590", name: "Uppgjörsreikningur VSK", type: "VAT_SETTLEMENT", entryRole: "SYSTEM" },
  { number: "3000", name: "Sölutekjur", type: "REVENUE", entryRole: "REVENUE" },
  { number: "3900", name: "Aðrar tekjur", type: "OTHER_REVENUE", entryRole: "REVENUE" },
  { ...expense24("4000", "Vörukaup og aðföng"), type: "COST_OF_GOODS" },
  expense24("4100", "Rekstrarvörur"),
  expense24("4110", "Verkfæri og smááhöld"),
  expense24("4120", "Tölvu- og skrifstofubúnaður"),
  expense24("4200", "Aðkeypt þjónusta"),
  expense24("4210", "Bókhalds- og endurskoðunarþjónusta"),
  expense24("4220", "Lögfræði- og ráðgjafarþjónusta"),
  expense24("4230", "Önnur sérfræðiþjónusta"),
  expense24("4300", "Húsaleiga", true),
  expense24("4310", "Rafmagn"),
  expense24("4320", "Hiti og hitaveita"),
  expense24("4330", "Vatn og fráveita"),
  expense24("4340", "Viðhald húsnæðis", true),
  expense24("4350", "Þrif og ræsting"),
  { number: "4360", name: "Fasteignagjöld", type: "OPERATING_EXPENSE", entryRole: "EXPENSE" },
  expense24("4400", "Sími og fjarskipti"),
  expense24("4410", "Internet"),
  expense24("4420", "Hugbúnaður og áskriftir"),
  expense24("4430", "Rekstur tölvubúnaðar"),
  { number: "4500", name: "Laun", type: "PAYROLL_EXPENSE", entryRole: "EXPENSE" },
  { number: "4510", name: "Lífeyrissjóður – mótframlag", type: "PAYROLL_EXPENSE", entryRole: "EXPENSE" },
  { number: "4530", name: "Tryggingagjald", type: "PAYROLL_EXPENSE", entryRole: "EXPENSE" },
  { number: "4600", name: "Tryggingar rekstrar", type: "OPERATING_EXPENSE", entryRole: "EXPENSE" },
  { number: "4610", name: "Húsnæðis- og lausafjártryggingar", type: "OPERATING_EXPENSE", entryRole: "EXPENSE" },
  { number: "4620", name: "Bifreiðatryggingar", type: "OPERATING_EXPENSE", entryRole: "EXPENSE" },
  expense24("4700", "Bifreiðakostnaður", true),
  expense24("4710", "Eldsneyti og hleðsla", true),
  expense24("4720", "Viðgerðir og viðhald bifreiða", true),
  expense24("4730", "Varahlutir og hjólbarðar", true),
  { number: "4740", name: "Bifreiðagjöld", type: "OPERATING_EXPENSE", entryRole: "EXPENSE" },
  expense24("4750", "Þrif og annar bifreiðakostnaður", true),
  expense24("4800", "Markaðs- og sölukostnaður"),
  expense24("4810", "Auglýsingar"),
  expense24("4820", "Vefur og vefverslun"),
  expense24("4830", "Prentun og kynningarefni"),
  expense24("4900", "Almennur rekstrarkostnaður", true),
  { number: "4910", name: "Veitingar", type: "OPERATING_EXPENSE", entryRole: "EXPENSE", vatRate: 11, vatAccount: "2520", vatRequiresConfirmation: true },
  expense24("4920", "Skrifstofuvörur og ritföng"),
  expense24("4930", "Ferðakostnaður", true),
  expense24("4940", "Námskeið og ráðstefnur", true),
  expense24("4950", "Félags- og áskriftargjöld", true),
  { number: "4960", name: "Annar kostnaður", type: "OTHER_EXPENSE", entryRole: "EXPENSE", vatRequiresConfirmation: true },
  { number: "4970", name: "Bankakostnaður og þjónustugjöld", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
  { number: "4980", name: "Greiðslu- og innheimtugjöld", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
  { number: "5100", name: "Vaxtagjöld", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
  { number: "5110", name: "Vextir af bankalánum", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
  { number: "5120", name: "Verðbætur", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
  { number: "5130", name: "Lántöku- og fjármagnskostnaður", type: "FINANCE_EXPENSE", entryRole: "EXPENSE" },
];

export const accountPromptText = defaultAccounts
  .map((account) => `${account.number} – ${account.name} [${account.type}]`)
  .join("\n");
