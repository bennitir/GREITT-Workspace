"use client";
import { useEffect, useState } from "react";
import { normalizeUiLanguage } from "@/lib/i18n/ui";

const greetings = {
  is: { day: "Góðan daginn", evening: "Góða kvöldið" },
  en: { day: "Good day", evening: "Good evening" },
  pl: { day: "Dzień dobry", evening: "Dobry wieczór" },
  sr: { day: "Добар дан", evening: "Добро вече" },
};
export default function Greeting({ name, language = "is" }: { name: string; language?: string }) {
  const lang = normalizeUiLanguage(language);
  const [greeting, setGreeting] = useState(greetings[lang].day);
  useEffect(() => {
    const updateGreeting = () => { const hour = new Date().getHours(); setGreeting(hour >= 4 && hour < 18 ? greetings[lang].day : greetings[lang].evening); };
    updateGreeting(); const interval = setInterval(updateGreeting, 60_000); return () => clearInterval(interval);
  }, [lang]);
  return <h2 className="text-3xl font-bold text-slate-900">{greeting}, {name}</h2>;
}
