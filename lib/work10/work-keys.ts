export function cleanWorkKeyCode(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeWorkKeyCode(value: unknown) {
  return cleanWorkKeyCode(value).toLowerCase();
}

export function workKeyDisplay(code: string, name: string) {
  return code === name ? code : `${code} · ${name}`;
}
