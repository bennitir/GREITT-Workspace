"use client";

import { useState } from "react";

type Props = {
  id: string;
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
};

export default function PasswordInput({
  id,
  name,
  required = false,
  minLength,
  autoComplete,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative mt-1">
      <input
        id={id}
        name={name}
        type={showPassword ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-lg border px-3 py-2 pr-12"
      />

      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-lg"
        aria-label={showPassword ? "Fela lykilorð" : "Sýna lykilorð"}
        title={showPassword ? "Fela lykilorð" : "Sýna lykilorð"}
      >
        {showPassword ? "🙈" : "👁️"}
      </button>
    </div>
  );
}