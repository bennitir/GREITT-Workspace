/**
 * Sameiginleg kennitölutól GLÖGGT.
 *
 * Markmið:
 * - Samræma kennitölur á 10 tölustafa form.
 * - Finna mögulegar íslenskar kennitölur í texta.
 * - Greina með varfærnum hætti hvort kennitala geti verið
 *   persónukennitala.
 *
 * Mikilvægt:
 * Þessi skrá segir ekki til um heimildir til vinnslu persónuupplýsinga.
 * Hún sér aðeins um tæknilega greiningu kennitalna.
 */

export function normalizeKennitala(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Staðfestir íslenska vartölu kennitölu.
 *
 * Vartalan er 9. tölustafur kennitölunnar.
 * Vægi fyrstu 8 tölustafanna:
 * 3, 2, 7, 6, 5, 4, 3, 2
 */
export function hasValidKennitalaChecksum(value: string): boolean {
  const kennitala = normalizeKennitala(value);

  if (!/^\d{10}$/.test(kennitala)) {
    return false;
  }

  const weights = [3, 2, 7, 6, 5, 4, 3, 2];

  const sum = weights.reduce((total, weight, index) => {
    return total + Number(kennitala[index]) * weight;
  }, 0);

  const remainder = sum % 11;

  if (remainder === 1) {
    return false;
  }

  const checkDigit = remainder === 0 ? 0 : 11 - remainder;

  return checkDigit === Number(kennitala[8]);
}

/**
 * Athugar hvort fyrstu sex tölustafir kennitölu myndi
 * raunverulegan fæðingardag.
 *
 * DDMMYY
 */
function hasValidBirthDate(value: string): boolean {
  const kennitala = normalizeKennitala(value);

  if (!/^\d{10}$/.test(kennitala)) {
    return false;
  }

  const day = Number(kennitala.slice(0, 2));
  const month = Number(kennitala.slice(2, 4));
  const year = Number(kennitala.slice(4, 6));
  const centuryDigit = kennitala[9];

  let fullYear: number;

  if (centuryDigit === "9") {
    fullYear = 1900 + year;
  } else if (centuryDigit === "0") {
    fullYear = 2000 + year;
  } else {
    return false;
  }

  const date = new Date(Date.UTC(fullYear, month - 1, day));

  return (
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Segir hvort gildi sé gild persónukennitala samkvæmt þeim
 * tæknilegu skilyrðum sem GLÖGGT notar:
 *
 * - 10 tölustafir
 * - raunverulegur fæðingardagur
 * - aldarvísir 9 eða 0
 * - gild vartala
 *
 * Þetta útilokar m.a. hefðbundnar kennitölur lögaðila þar sem
 * fyrstu tveir tölustafirnir geta ekki táknað raunverulegan dag.
 */
export function isValidPersonKennitala(value: string): boolean {
  const kennitala = normalizeKennitala(value);

  if (!/^\d{10}$/.test(kennitala)) {
    return false;
  }

  return (
    hasValidBirthDate(kennitala) &&
    hasValidKennitalaChecksum(kennitala)
  );
}

/**
 * Finnur einstakar, gildar persónukennitölur í texta.
 *
 * Tekur bæði:
 *   0101701239
 * og
 *   010170-1239
 *
 * Skilar alltaf normalized 10 stafa kennitölum án bandstriks.
 */
export function extractPersonKennitolur(text: string): string[] {
  if (!text) {
    return [];
  }

  const candidates = text.match(
    /(?<!\d)\d{6}-?\d{4}(?!\d)/g
  ) ?? [];

  const valid = candidates
    .map(normalizeKennitala)
    .filter(isValidPersonKennitala);

  return [...new Set(valid)];
}