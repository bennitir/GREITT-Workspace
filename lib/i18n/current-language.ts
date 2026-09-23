import "server-only";

import {
  getRequestAuthContext,
  getRequestUserInterfaceSettings,
} from "@/lib/core/request-context";
import { normalizeUiLanguage } from "@/lib/i18n/ui";

export async function getCurrentInterfaceLanguage() {
  const context = await getRequestAuthContext();
  const sessionUser = context.sessionUser;

  if (!sessionUser) return "is" as const;

  // Varðveitir núverandi hegðun: tungumál þess sem er raunverulega innskráður
  // stýrir þessari helper-aðgerð, einnig þegar ADMIN vinnur í impersonation.
  const settings = await getRequestUserInterfaceSettings(sessionUser.id);
  return normalizeUiLanguage(settings?.interfaceLanguage);
}
