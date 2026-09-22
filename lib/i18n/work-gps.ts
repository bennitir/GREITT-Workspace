import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "GPS-framvinda",
    waiting: "Bíður eftir staðsetningu…",
    active: "GPS-track virkt",
    weak: "Bíður eftir nákvæmari GPS-staðsetningu…",
    denied: "Staðsetningarheimild var ekki veitt. GPS-track safnast ekki.",
    unavailable: "GPS-staðsetning er ekki tiltæk núna.",
    unsupported: "Þessi vafri styður ekki GPS-staðsetningu.",
    error: "Ekki tókst að skrá GPS-punkt.",
    points: "punktar",
    accuracy: "nákvæmni",
    firstTest: "Fyrsta prófunarútgáfa: Mobile-vafrinn getur gert hlé á skráningu ef síminn læsist eða appið fer alveg í bakgrunn.",
  },
  en: {
    title: "GPS progress",
    waiting: "Waiting for location…",
    active: "GPS track active",
    weak: "Waiting for a more accurate GPS fix…",
    denied: "Location permission was not granted. GPS track is not being recorded.",
    unavailable: "GPS location is currently unavailable.",
    unsupported: "This browser does not support GPS location.",
    error: "The GPS point could not be recorded.",
    points: "points",
    accuracy: "accuracy",
    firstTest: "First test version: the mobile browser may pause tracking if the phone locks or the app is fully backgrounded.",
  },
  pl: {
    title: "Postęp GPS",
    waiting: "Oczekiwanie na lokalizację…",
    active: "Śledzenie GPS aktywne",
    weak: "Oczekiwanie na dokładniejszą lokalizację GPS…",
    denied: "Nie przyznano dostępu do lokalizacji. Ślad GPS nie jest zapisywany.",
    unavailable: "Lokalizacja GPS jest obecnie niedostępna.",
    unsupported: "Ta przeglądarka nie obsługuje lokalizacji GPS.",
    error: "Nie udało się zapisać punktu GPS.",
    points: "punkty",
    accuracy: "dokładność",
    firstTest: "Pierwsza wersja testowa: przeglądarka mobilna może wstrzymać zapis po zablokowaniu telefonu lub pełnym przejściu aplikacji w tło.",
  },
  sr: {
    title: "GPS напредак",
    waiting: "Чека се локација…",
    active: "GPS праћење је активно",
    weak: "Чека се прецизнија GPS локација…",
    denied: "Дозвола за локацију није дата. GPS траг се не снима.",
    unavailable: "GPS локација тренутно није доступна.",
    unsupported: "Овај прегледач не подржава GPS локацију.",
    error: "GPS тачка није могла да се сачува.",
    points: "тачака",
    accuracy: "прецизност",
    firstTest: "Прва тест верзија: мобилни прегледач може паузирати снимање ако се телефон закључа или апликација потпуно оде у позадину.",
  },
} as const;

export function workGpsText(language: string) {
  return text[normalizeUiLanguage(language) as keyof typeof text] ?? text.is;
}
