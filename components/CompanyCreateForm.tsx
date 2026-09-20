"use client";

import PhoneInput from "@/components/ui/PhoneInput";
import KennitalaInput from "@/components/ui/KennitalaInput";
import { createCompany } from "@/app/actions/companyActions";
import { useRouter } from "next/navigation";
import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";
import { adminText } from "@/lib/i18n/admin";

export default function CompanyCreateForm({ language = "is" }: { language?: string | null }) {
  const router = useRouter();
  const t = adminText(language).companyCreate;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await createCompany({
      name: String(formData.get("name")),
      kennitala: String(formData.get("kennitala")).replace(/\D/g, ""),
      vatNumber: String(formData.get("vatNumber") || "") || null,
      address: String(formData.get("address")),
      phone: String(formData.get("phone")).replace(/\D/g, ""),
      email: String(formData.get("email")),
      contact: String(formData.get("contact")),
    });

    router.push("/fyrirtaeki");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <TextInput label={t.name} name="name" />
      <KennitalaInput label={t.idNumber} name="kennitala" />
      <TextInput label={t.vatNumber} name="vatNumber" />
      <TextInput label={t.address} name="address" />
      <PhoneInput label={t.phone} name="phone" />
      <TextInput label={t.email} name="email" type="email" />
      <TextInput label={t.contact} name="contact" />
      <Button type="submit">{t.create}</Button>
    </form>
  );
}
