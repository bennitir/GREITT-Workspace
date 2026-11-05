export type FamilyEligibilityInput = {
  bankStatus: string; amount: string; classification: string | null;
  hasReconciliation: boolean; hasPayment: boolean;
};
export function familyTransferBlockReason(input: FamilyEligibilityInput): string | null {
  if (input.hasReconciliation || input.hasPayment || input.bankStatus !== 'UNRECONCILED') {
    return 'Fjölskylduskipting er lokuð: færslan hefur afstemmingu, greiðslutengingu eða frágengna stöðu. Yfirfara þarf fyrirliggjandi tengsl sérstaklega í hefðbundnu afstemmingunni. Þau verða ekki felld niður eða yfirskrifuð hér.';
  }
  if (!/^-\d+(?:\.0+)?$/.test(input.amount) || !Number.isSafeInteger(-Number(input.amount)) || Number(input.amount) >= 0) {
    return 'Þetta flæði er aðeins fyrir útgreiðslu af reikningi foreldris í heilum krónum.';
  }
  if (input.classification !== 'PERSONAL') {
    return 'Færslan þarf fyrst að vera yfirfarin og merkt Persónulegt í hefðbundnu afstemmingunni. Venjuleg birgjagreiðsla á ekki heima í fjölskylduviðaukanum.';
  }
  return null;
}
