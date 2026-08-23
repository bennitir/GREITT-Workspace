"use client";
import PhoneInput from "@/components/ui/PhoneInput";
import KennitalaInput from "@/components/ui/KennitalaInput";
import { createCompany } from "@/app/actions/companyActions";
import { useRouter } from "next/navigation";
import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";

export default function CompanyCreateForm() {
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    await createCompany({
      name: String(formData.get("name")),
      kennitala: String(formData.get("kennitala")).replace(/\D/g, ""),
      vatNumber:
  String(formData.get("vatNumber") || "") || null,
      address: String(formData.get("address")),
      phone: String(formData.get("phone")).replace(/\D/g, ""),
      email: String(formData.get("email")),
      contact: String(formData.get("contact")),
    });

    router.push("/fyrirtaeki");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 max-w-xl"
    >
      <TextInput
        label="Nafn"
        name="name"
      />

      <KennitalaInput
  label="Kennitala"
  name="kennitala"
/>

      <TextInput
  label="VSK-númer"
  name="vatNumber"
/>

      <TextInput
        label="Heimilisfang"
        name="address"
      />

      <PhoneInput
  label="Sími"
  name="phone"
/>

      <TextInput
        label="Netfang"
        name="email"
        type="email"
      />

      <TextInput
        label="Tengiliður"
        name="contact"
      />

      <Button type="submit">
        Stofna fyrirtæki
      </Button>
    </form>
  );
}