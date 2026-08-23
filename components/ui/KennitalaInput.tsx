"use client";

import { useState } from "react";

type KennitalaInputProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
};

function formatKennitala(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 6) {
    return digits;
  }

  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export default function KennitalaInput({
  label,
  name,
  defaultValue = "",
  required = false,
}: KennitalaInputProps) {
  const [value, setValue] = useState(
    formatKennitala(defaultValue)
  );

  return (
    <div>
      <label className="mb-1 block font-medium">
        {label}
      </label>

      <input
        name={name}
        type="text"
        inputMode="numeric"
        value={value}
        required={required}
        onChange={(event) => {
          setValue(formatKennitala(event.target.value));
        }}
        className="w-full rounded-lg border px-3 py-2"
      />
    </div>
  );
}