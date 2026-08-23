export const defaultAccounts = [
  {
    number: "1000",
    name: "Sjóður",
    type: "CASH",
    entryRole: "PAYMENT",
  },
  {
    number: "1510",
    name: "Banki",
    type: "BANK",
    entryRole: "PAYMENT",
  },
  {
    number: "1600",
    name: "Viðskiptakröfur",
    type: "ACCOUNTS_RECEIVABLE",
    entryRole: "GENERAL",
  },
  {
    number: "2000",
    name: "Viðskiptaskuldir",
    type: "ACCOUNTS_PAYABLE",
    entryRole: "PAYMENT",
  },
  {
    number: "2510",
    name: "Útskattur",
    type: "VAT_OUTPUT",
    entryRole: "SYSTEM",
  },
  {
    number: "2520",
    name: "Innskattur",
    type: "VAT_INPUT",
    entryRole: "SYSTEM",
  },
  {
    number: "2550",
    name: "Staðgreiðsla launa",
    type: "PAYROLL_LIABILITY",
    entryRole: "SYSTEM",
  },
  {
    number: "2590",
    name: "Uppgjörsreikningur VSK",
    type: "VAT_SETTLEMENT",
    entryRole: "SYSTEM",
  },
    {
    number: "3000",
    name: "Sölutekjur",
    type: "REVENUE",
    entryRole: "REVENUE",
  },
  {
    number: "3900",
    name: "Aðrar tekjur",
    type: "OTHER_REVENUE",
    entryRole: "REVENUE",
  },
  {
    number: "4000",
    name: "Vörukaup og aðföng",
    type: "COST_OF_GOODS",
    entryRole: "EXPENSE",
  },
  {
    number: "4530",
    name: "Tryggingagjald",
    type: "PAYROLL_EXPENSE",
    entryRole: "EXPENSE",
  },
  {
    number: "4900",
    name: "Almennur rekstrarkostnaður",
    type: "OPERATING_EXPENSE",
    entryRole: "EXPENSE",
  },
  {
    number: "4910",
    name: "Veitingakaup",
    type: "OPERATING_EXPENSE",
    entryRole: "EXPENSE",
    vatRate: 11,
    vatAccount: "2520",
    vatRequiresConfirmation: true,
  },
  {
    number: "4960",
    name: "Annar kostnaður",
    type: "OTHER_EXPENSE",
    entryRole: "EXPENSE",
  },
];
export type DefaultAccount = (typeof defaultAccounts)[number];

export const accountPromptText = defaultAccounts
  .map(
    (account) =>
      `${account.number} – ${account.name} [${account.type}]`
  )
  .join("\n");