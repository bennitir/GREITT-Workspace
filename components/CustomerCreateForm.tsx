"use client";
import TextInput from "@/components/ui/TextInput";
import { createCustomer } from "@/app/actions/customerActions";
import { useRouter } from "next/navigation";
export default function CustomerCreateForm() {
  const router = useRouter();

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);

  await createCustomer({
    name: String(formData.get("name")),
    kennitala: String(formData.get("kennitala")),
    email: String(formData.get("email")),
    phone: String(formData.get("phone")),
    address: String(formData.get("address")),
  });

  router.push("/vidskiptavinir");
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

  <TextInput
    label="Kennitala"
    name="kennitala"
  />

  <TextInput
    label="Netfang"
    name="email"
    type="email"
  />

  <TextInput
    label="Sími"
    name="phone"
  />

  <TextInput
    label="Heimilisfang"
    name="address"
  />

  <button
    type="submit"
    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
  >
    Stofna viðskiptavin
  </button>
</form>
  );
}