import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { paymentCardText } from "@/lib/i18n/payment-card";
import { reconciliationCoverageText } from "@/lib/i18n/reconciliation-coverage";
import { financialSourceClassificationText } from "@/lib/i18n/financial-source-classification";
import { reviewedDocumentDiagnosticText } from "@/lib/i18n/reviewed-document-diagnostic";

export async function paymentCardPageContext() {
  const cookieStore = await cookies();
  const companyId = Number(cookieStore.get("activeCompanyId")?.value);
  const token = cookieStore.get("sessionToken")?.value;

  const session = token
    ? await prisma.session.findUnique({
        where: { token },
        select: { userId: true },
      })
    : null;

  const settings = session
    ? await prisma.userSettings.findUnique({
        where: { userId: session.userId },
        select: { interfaceLanguage: true },
      })
    : null;

  const interfaceLanguage =
    settings?.interfaceLanguage === "en" ||
    settings?.interfaceLanguage === "pl" ||
    settings?.interfaceLanguage === "sr" ||
    settings?.interfaceLanguage === "is"
      ? settings.interfaceLanguage
      : "is";

  return {
    companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    t: paymentCardText(interfaceLanguage),
    coverageT: reconciliationCoverageText(interfaceLanguage),
    classificationT: financialSourceClassificationText(interfaceLanguage),
    diagnosticT: reviewedDocumentDiagnosticText(interfaceLanguage),
  };
}
