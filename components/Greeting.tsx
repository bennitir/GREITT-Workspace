"use client";

import { useEffect, useState } from "react";

export default function Greeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("Góðan daginn");

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();

      setGreeting(
        hour >= 4 && hour < 18
          ? "Góðan daginn"
          : "Góða kvöldið"
      );
    };

    updateGreeting();

    const interval = setInterval(updateGreeting, 60_000);

    return () => clearInterval(interval);
  }, []);

  return (
    <h2 className="text-3xl font-bold text-slate-900">
      {greeting}, {name}
    </h2>
  );
}