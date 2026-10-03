import type { SalesPermission } from "@/lib/core/sales-permissions";
import { normalizeUiLanguage } from "@/lib/i18n/ui";

type PermissionLabels = Record<SalesPermission, string>;

const text = {
  is: {
    title: "Sala",
    help: "Veldu hvaða aðgerðir notandinn má framkvæma í Sölu.",
    settingsFor: "Söluheimildir fyrir",
    save: "Vista söluheimildir",
    saved: "Söluheimildir vistaðar.",
    noUsers: "Enginn virkur notandi er tengdur fyrirtækinu.",
    permissions: {
      SALE_USE: "Nota Sölu",
      SALE_HOLD: "Setja sölu í bið",
      SALE_DISCOUNT: "Veita afslátt",
      SALE_CHANGE_PRICE: "Breyta verði",
      SALE_INVOICE: "Gefa út reikning",
      SALE_REFUND: "Endurgreiða",
      SALE_VOID: "Ógilda sölu",
      SALE_SETTLEMENT_VIEW: "Skoða uppgjör",
      SALE_SETTLEMENT_CREATE: "Stofna uppgjör",
      SALE_SETTLEMENT_FINALIZE: "Loka uppgjöri",
      SALE_CUSTOMER_MANAGE: "Stjórna viðskiptavinum",
      SALE_SETTINGS_MANAGE: "Breyta sölustillingum",
    } satisfies PermissionLabels,
  },
  en: {
    title: "Sales",
    help: "Choose which Sales actions this user may perform.",
    settingsFor: "Sales permissions for",
    save: "Save Sales permissions",
    saved: "Sales permissions saved.",
    noUsers: "No active user is connected to the company.",
    permissions: {
      SALE_USE: "Use Sales",
      SALE_HOLD: "Hold a sale",
      SALE_DISCOUNT: "Apply discounts",
      SALE_CHANGE_PRICE: "Change prices",
      SALE_INVOICE: "Issue invoices",
      SALE_REFUND: "Issue refunds",
      SALE_VOID: "Void sales",
      SALE_SETTLEMENT_VIEW: "View settlements",
      SALE_SETTLEMENT_CREATE: "Create settlements",
      SALE_SETTLEMENT_FINALIZE: "Finalize settlements",
      SALE_CUSTOMER_MANAGE: "Manage customers",
      SALE_SETTINGS_MANAGE: "Manage Sales settings",
    } satisfies PermissionLabels,
  },
  pl: {
    title: "Sprzedaż",
    help: "Wybierz działania w module Sprzedaż, które użytkownik może wykonywać.",
    settingsFor: "Uprawnienia sprzedaży dla",
    save: "Zapisz uprawnienia sprzedaży",
    saved: "Uprawnienia sprzedaży zapisane.",
    noUsers: "Brak aktywnego użytkownika powiązanego z firmą.",
    permissions: {
      SALE_USE: "Korzystać z modułu Sprzedaż",
      SALE_HOLD: "Wstrzymywać sprzedaż",
      SALE_DISCOUNT: "Udzielać rabatów",
      SALE_CHANGE_PRICE: "Zmieniać ceny",
      SALE_INVOICE: "Wystawiać faktury",
      SALE_REFUND: "Dokonywać zwrotów",
      SALE_VOID: "Anulować sprzedaż",
      SALE_SETTLEMENT_VIEW: "Przeglądać rozliczenia",
      SALE_SETTLEMENT_CREATE: "Tworzyć rozliczenia",
      SALE_SETTLEMENT_FINALIZE: "Finalizować rozliczenia",
      SALE_CUSTOMER_MANAGE: "Zarządzać klientami",
      SALE_SETTINGS_MANAGE: "Zarządzać ustawieniami sprzedaży",
    } satisfies PermissionLabels,
  },
  sr: {
    title: "Продаја",
    help: "Изаберите које радње у Продаји овај корисник сме да обавља.",
    settingsFor: "Овлашћења за продају за",
    save: "Сачувај овлашћења за продају",
    saved: "Овлашћења за продају су сачувана.",
    noUsers: "Ниједан активан корисник није повезан са компанијом.",
    permissions: {
      SALE_USE: "Користи Продају",
      SALE_HOLD: "Стави продају на чекање",
      SALE_DISCOUNT: "Одобри попуст",
      SALE_CHANGE_PRICE: "Промени цену",
      SALE_INVOICE: "Издај фактуру",
      SALE_REFUND: "Изврши повраћај",
      SALE_VOID: "Поништи продају",
      SALE_SETTLEMENT_VIEW: "Прегледај обрачуне",
      SALE_SETTLEMENT_CREATE: "Креирај обрачун",
      SALE_SETTLEMENT_FINALIZE: "Заврши обрачун",
      SALE_CUSTOMER_MANAGE: "Управљај купцима",
      SALE_SETTINGS_MANAGE: "Управљај подешавањима продаје",
    } satisfies PermissionLabels,
  },
} as const;

export function salesPermissionsText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
