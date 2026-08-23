"use client";

import { useState } from "react";
import {
  updateCompany,
  uploadRskCertificate,
} from "@/app/actions/companyActions";
import TextInput from "@/components/ui/TextInput";
import PhoneInput from "@/components/ui/PhoneInput";
import Button from "@/components/ui/Button";

type Company = {
  id: number;
  name: string;
  kennitala: string;
  address: string;
  phone: string;
  email: string;
  contact: string;
  vatNumber: string | null;

  nextVoucherNumber: number;

  rskRegisteredActivities: string | null;
  activeActivities: string | null;
  rskDataUpdatedAt: Date | null;
  activitiesConfirmedAt: Date | null;
  activitiesConfirmedBy: string | null;
  rskCertificatePath: string | null;
};

type Props = {
  company: Company;
};

export default function CompanyEditForm({ company }: Props) {
  const [message, setMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const rskCertificate =
      formData.get("rskCertificate") as File | null;

    const nextVoucherNumber = Number(
      formData.get("nextVoucherNumber")
    );

    if (
      !Number.isInteger(nextVoucherNumber) ||
      nextVoucherNumber < 1
    ) {
      setMessage(
        "Næsta fylgiskjalsnúmer verður að vera heil tala stærri en 0."
      );
      return;
    }

    await updateCompany(company.id, {
      name: String(formData.get("name")),
      kennitala: String(formData.get("kennitala")).replace(/\D/g, ""),
      address: String(formData.get("address")),
      phone: String(formData.get("phone")).replace(/\D/g, ""),
      email: String(formData.get("email")),
      contact: String(formData.get("contact")),

      vatNumber:
        String(formData.get("vatNumber") || "") || null,

      nextVoucherNumber,

      rskRegisteredActivities:
        String(
          formData.get("rskRegisteredActivities") || ""
        ) || null,

      activeActivities:
        String(formData.get("activeActivities") || "") ||
        null,

      activitiesConfirmedBy:
        String(
          formData.get("activitiesConfirmedBy") || ""
        ) || null,

      activitiesConfirmedAt: formData.get(
        "activitiesConfirmedAt"
      )
        ? new Date(
            String(formData.get("activitiesConfirmedAt"))
          )
        : null,

      rskCertificatePath: company.rskCertificatePath,
    });

    if (rskCertificate && rskCertificate.size > 0) {
      await uploadRskCertificate(
        company.id,
        rskCertificate
      );
    }

    setMessage("Breytingar vistaðar í gagnagrunni.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-5"
    >
      <TextInput
        label="Nafn"
        name="name"
        defaultValue={company.name}
      />

      <TextInput
  label="Kennitala"
  name="kennitala"
  defaultValue={
    company.kennitala.includes("-")
      ? company.kennitala
      : `${company.kennitala.slice(0, 6)}-${company.kennitala.slice(6)}`
  }
  readOnly
/>

      <TextInput
        label="VSK-númer"
        name="vatNumber"
        defaultValue={company.vatNumber ?? ""}
      />

      <TextInput
        label="Heimilisfang"
        name="address"
        defaultValue={company.address}
      />

      <PhoneInput
  label="Sími"
  name="phone"
  defaultValue={company.phone}
/>

      <TextInput
        label="Netfang"
        name="email"
        type="email"
        defaultValue={company.email}
      />

      <TextInput
        label="Tengiliður"
        name="contact"
        defaultValue={company.contact}
      />

      <div className="border-t pt-5">
        <h2 className="mb-4 text-lg font-semibold">
          Bókhald
        </h2>

        <div>
          <label className="mb-1 block font-medium">
            Næsta fylgiskjalsnúmer
          </label>

          <input
  type="number"
  name="nextVoucherNumber"
  min="1"
  step="1"
  required
  defaultValue={company.nextVoucherNumber}
  readOnly
  className="block w-full rounded border bg-slate-100 p-2 text-slate-600"
/>0

          <p className="mt-1 text-sm text-slate-500">
            Næsta samþykkta fylgiskjal fær þetta númer.
          </p>
        </div>
      </div>

      <div className="border-t pt-5">
        <h2 className="mb-4 text-lg font-semibold">
          RSK og virk starfsemi
        </h2>

        <TextInput
          label="Skráð hjá RSK"
          name="rskRegisteredActivities"
          defaultValue={
            company.rskRegisteredActivities ?? ""
          }
        />

        <TextInput
          label="Virk starfsemi"
          name="activeActivities"
          defaultValue={company.activeActivities ?? ""}
        />

        <TextInput
          label="Virk starfsemi staðfest af"
          name="activitiesConfirmedBy"
          defaultValue={
            company.activitiesConfirmedBy ?? ""
          }
        />

        <div>
          <label className="mb-1 block font-medium">
            Dagsetning staðfestingar
          </label>

          <input
            type="date"
            name="activitiesConfirmedAt"
            defaultValue={
              company.activitiesConfirmedAt
                ? new Date(
                    company.activitiesConfirmedAt
                  )
                    .toISOString()
                    .slice(0, 10)
                : ""
            }
            className="block w-full rounded border p-2"
          />
        </div>

        <div>
          <label className="mb-1 block font-medium">
            Staðfest vottorð frá RSK (valkvætt)
          </label>

          <input
            type="file"
            name="rskCertificate"
            accept=".pdf"
            className="block w-full rounded border p-2"
          />

          {company.rskCertificatePath && (
            <p className="mt-2 text-sm text-green-700">
              ✓ Vottorð er þegar skráð
            </p>
          )}
        </div>
      </div>

      <Button type="submit">
        Vista breytingar
      </Button>

      {message && (
        <p className="font-medium text-green-700">
          {message}
        </p>
      )}
    </form>
  );
}