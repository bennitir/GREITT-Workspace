import { Resend } from "resend";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  console.log("RESEND ENV CHECK:", {
  hasKey: Boolean(apiKey),
  length: apiKey?.length ?? 0,
});

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
    from: "GLÖGGT <onboarding@resend.dev>",
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
      "GLÖGGT",
    ].join("\n"),
  });

  if (result.error) {
    throw new Error(
      `Ekki tókst að senda aðgangspóst: ${result.error.message}`
    );
  }

  return result.data;
}