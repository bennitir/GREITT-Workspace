import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    emailNotifications: "Tölvupósttilkynningar",
    emailNotificationsHelp: "Fá tölvupóst um áminningar, gagnaskil og verkefni sem varða þetta fyrirtæki.",
    enabled: "Tilkynningar virkar",
    disabled: "Tilkynningar óvirkar",
    saveAccess: "Vista réttindi og tilkynningar",
    connectWithNotifications: "Fá tölvupósttilkynningar",
    chooseAccessRole: "Veldu aðgang",
  },
  en: {
    emailNotifications: "Email notifications",
    emailNotificationsHelp: "Receive email reminders, document requests and tasks related to this company.",
    enabled: "Notifications enabled",
    disabled: "Notifications disabled",
    saveAccess: "Save access and notifications",
    connectWithNotifications: "Receive email notifications",
    chooseAccessRole: "Choose access",
  },
  pl: {
    emailNotifications: "Powiadomienia e-mail",
    emailNotificationsHelp: "Otrzymuj e-maile o przypomnieniach, brakujących dokumentach i zadaniach dotyczących tej firmy.",
    enabled: "Powiadomienia włączone",
    disabled: "Powiadomienia wyłączone",
    saveAccess: "Zapisz uprawnienia i powiadomienia",
    connectWithNotifications: "Otrzymuj powiadomienia e-mail",
    chooseAccessRole: "Wybierz dostęp",
  },
  sr: {
    emailNotifications: "Обавештења е-поштом",
    emailNotificationsHelp: "Примајте е-пошту о подсетницима, достави докумената и задацима за ову компанију.",
    enabled: "Обавештења су укључена",
    disabled: "Обавештења су искључена",
    saveAccess: "Сачувај овлашћења и обавештења",
    connectWithNotifications: "Примај обавештења е-поштом",
    chooseAccessRole: "Изабери приступ",
  },
} as const;

export function companyAccessText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
