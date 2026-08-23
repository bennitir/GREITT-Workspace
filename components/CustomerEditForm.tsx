"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateCustomer } from "@/app/actions/customerActions";
import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";

type Customer = {
  id: number;
  name: string;
  kennitala: string;
  email: string;
  phone: string;
  address: string;
};

type Props = {
  customer: Customer;
};

export default function CustomerEditForm({ customer }: Props) {
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    await updateCustomer(customer.id, {
      name: String(formData.get("name")),
      kennitala: String(formData.get("kennitala")),
      email: String(formData.get("email")),
      phone: String(formData.get("phone")),
      address: String(formData.get("address")),
    });

    router.push(`/vidskiptavinir/${customer.id}`);
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
        defaultValue={customer.name}
      />

      <TextInput
        label="Kennitala"
        name="kennitala"
        defaultValue={customer.kennitala}
      />

      <TextInput
        label="Netfang"
        name="email"
        type="email"
        defaultValue={customer.email}
      />

      <TextInput
        label="Sími"
        name="phone"
        defaultValue={customer.phone}
      />

      <TextInput
        label="Heimilisfang"
        name="address"
        defaultValue={customer.address}
      />

      <Button type="submit">
        Vista breytingar
      </Button>
    </form>
  );
}