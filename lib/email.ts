import { Resend } from "resend";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY vantar.");
  }

  return new Resend(apiKey);
}

export async function sendTemporaryPasswordEmail({
  name,
  email,
  temporaryPassword,
}: {
  name: string;
  email: string;
  temporaryPassword: string;
}) {
  const resend = getResend();

  const result = await resend.emails.send({
    from: "GLÖGGT <noreply@gloggt.is>",
    to: email,
    subject: "Aðgangur að GLÖGGT",
    text: [
      `Góðan daginn ${name},`,
      "",
      "Aðgangur hefur verið stofnaður fyrir þig að GLÖGGT.",
      "",
      `Netfang: ${email}`,
      `Tímabundið lykilorð: ${temporaryPassword}`,
      "",
      "Við fyrstu innskráningu verður þú beðinn um að velja nýtt lykilorð.",
      "Nýja lykilorðið þarf að vera að minnsta kosti 10 stafir.",
      "Við mælum með að nota sterkt lykilorð sem vafrinn þinn leggur til.",
      "",
      "GLÖGGT í tölvu:",
      "https://www.gloggt.is",
      "",
      "GLÖGGT Mobile í síma:",
      "https://www.gloggt.is/mobile",
      "",
      "GLÖGGT Mobile má setja upp á heimaskjá símans og nota eins og app.",
      "",
      "Kveðja,",
      "GLÖGGT",
      "Lausnir fyrir reksturinn",
    ].join("\n"),
  });

  if (result.error) {
    throw new Error(
      `Ekki tókst að senda aðgangspóst: ${result.error.message}`
    );
  }

  return result.data;
}

export async function sendPasswordResetEmail({
  name,
  email,
  resetUrl,
}: {
  name: string;
  email: string;
  resetUrl: string;
}) {
  const resend = getResend();

  const result = await resend.emails.send({
    from: "GLÖGGT <noreply@gloggt.is>",
    to: email,
    subject: "Endurstilla lykilorð í GLÖGGT",
    text: [
      `Góðan daginn ${name},`,
      "",
      "Beðið hefur verið um að endurstilla lykilorðið þitt í GLÖGGT.",
      "",
      "Veldu nýtt lykilorð hér:",
      resetUrl,
      "",
      "Hlekkurinn gildir aðeins í takmarkaðan tíma og verður ónothæfur eftir notkun.",
      "",
      "Ef þú baðst ekki um endurstillingu geturðu hunsað þennan póst.",
      "",
      "GLÖGGT í tölvu:",
      "https://www.gloggt.is",
      "",
      "GLÖGGT Mobile í síma:",
      "https://www.gloggt.is/mobile",
      "",
      "Kveðja,",
      "GLÖGGT",
      "Lausnir fyrir reksturinn",
    ].join("\n"),
  });

  if (result.error) {
    throw new Error(
      `Ekki tókst að senda lykilorðsendurstillingu: ${result.error.message}`
    );
  }

  return result.data;
}