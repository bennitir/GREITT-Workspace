import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { paymentCardText } from "@/lib/i18n/payment-card";

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

  return {
    companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    t: paymentCardText(settings?.interfaceLanguage),
  };
}
