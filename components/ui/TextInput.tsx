type TextInputProps = {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
};

export default function TextInput({
  label,
  name,
  type = "text",
  defaultValue,
  required = false,
  placeholder,
  disabled = false,
  readOnly = false,
  className = "",
}: TextInputProps) {
  return (
    <div>
      <label className="mb-1 block font-medium">
        {label}
      </label>

      <input
  name={name}
  type={type}
  defaultValue={defaultValue}
  required={required}
  placeholder={placeholder}
  disabled={disabled}
  readOnly={readOnly}
  className={`w-full rounded-lg border px-3 py-2 ${className}`}
/>
    </div>
  );
}