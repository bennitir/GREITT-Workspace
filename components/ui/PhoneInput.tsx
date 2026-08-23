"use client";

import { useState } from "react";

type PhoneInputProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 7);

  if (digits.length <= 3) {
    return digits;
  }

  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export default function PhoneInput({
  label,
  name,
  defaultValue = "",
  required = false,
}: PhoneInputProps) {
  const [value, setValue] = useState(
    formatPhone(defaultValue)
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
          setValue(formatPhone(event.target.value));
        }}
        className="w-full rounded-lg border px-3 py-2"
      />
    </div>
  );
}