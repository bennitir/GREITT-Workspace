"use client";

import { useState } from "react";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
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
  vatRegistered: boolean | null;
  vatRegistrationDate: Date | null;
  vatSettlementType: string | null;
  vatDataSource: string | null;
  vatDataUpdatedAt: Date | null;
  vatConfirmedAt: Date | null;
  vatConfirmedBy: string | null;

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
  const [vatRegistered, setVatRegistered] = useState<
  "" | "YES" | "NO"
>(
  company.vatRegistered === true
    ? "YES"
    : company.vatRegistered === false
      ? "NO"
      : ""
);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

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

    const vatRegisteredValue = String(
      formData.get("vatRegistered") ?? ""
    );
const vatRegistered =
  vatRegisteredValue === "YES"
    ? true
    : vatRegisteredValue === "NO"
      ? false
      : null;

const hasVatRegistration = vatRegistered === true;

    await updateCompany(company.id, {
      name: String(formData.get("name")),
      kennitala: String(
        formData.get("kennitala")
      ).replace(/\D/g, ""),
      address: String(formData.get("address")),
      phone: String(formData.get("phone")).replace(
        /\D/g,
        ""
      ),
      email: String(formData.get("email")),
      contact: String(formData.get("contact")),

      vatNumber: hasVatRegistration
  ? String(formData.get("vatNumber") || "") || null
  : null,
      vatRegistered,

      vatRegistrationDate:
  hasVatRegistration &&
  formData.get("vatRegistrationDate")
    ? new Date(
        String(formData.get("vatRegistrationDate"))
      )
    : null,

      vatSettlementType: hasVatRegistration
  ? String(
      formData.get("vatSettlementType") || ""
    ) || null
  : null,

      vatDataSource: hasVatRegistration
  ? String(formData.get("vatDataSource") || "") || null
  : null,

vatConfirmedAt:
  hasVatRegistration &&
  formData.get("vatConfirmedAt")
    ? new Date(
        String(formData.get("vatConfirmedAt"))
      )
    : null,

vatConfirmedBy: hasVatRegistration
  ? String(formData.get("vatConfirmedBy") || "") || null
  : null,

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
            : `${company.kennitala.slice(
                0,
                6
              )}-${company.kennitala.slice(6)}`
        }
        readOnly
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
          VSK
        </h2>

        <div className="space-y-2">
          <label className="block font-medium">
            VSK-skráning
          </label>

          <select
  name="vatRegistered"
  value={vatRegistered}
  onChange={(event) =>
    setVatRegistered(
      event.target.value as "" | "YES" | "NO"
    )
  }
  className="block w-full rounded border p-2"
>
            <option value="">
              Ekki staðfest
            </option>
            <option value="YES">
              Já, VSK-skráð
            </option>
            <option value="NO">
              Nei, ekki VSK-skráð
            </option>
          </select>
        </div>

{vatRegistered === "YES" && (
  <div className="space-y-5">
        <TextInput
          label="VSK-númer"
          name="vatNumber"
          defaultValue={company.vatNumber ?? ""}
        />

        <div>
          <label className="mb-1 block font-medium">
            Skráningardagur VSK
          </label>

          <IcelandicDateInput
            name="vatRegistrationDate"
            defaultValue={
              company.vatRegistrationDate
                ? new Date(
                    company.vatRegistrationDate
                  )
                    .toISOString()
                    .slice(0, 10)
                : ""
            }
          />
        </div>

        <div className="space-y-2">
          <label className="block font-medium">
            Uppgjörstegund VSK
          </label>

          <select
            name="vatSettlementType"
            defaultValue={
              company.vatSettlementType ?? ""
            }
            className="block w-full rounded border p-2"
          >
            <option value="">
              Ekki staðfest
            </option>
            <option value="BIMONTHLY">
              Tveggja mánaða skil
            </option>
            <option value="ANNUAL">
              Árleg skil
            </option>
            <option value="MONTHLY">
              Mánaðarleg skil
            </option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block font-medium">
            Uppruni VSK-upplýsinga
          </label>

          <select
            name="vatDataSource"
            defaultValue={company.vatDataSource ?? ""}
            className="block w-full rounded border p-2"
          >
            <option value="">
              Ekki skráð
            </option>
            <option value="MANUAL">
              Handvirk skráning
            </option>
            <option value="RSK">
              RSK / Skatturinn
            </option>
            <option value="IMPORT">
              Innflutt gögn
            </option>
          </select>
        </div>

        <TextInput
          label="VSK-upplýsingar staðfestar af"
          name="vatConfirmedBy"
          defaultValue={company.vatConfirmedBy ?? ""}
        />

        <div>
          <label className="mb-1 block font-medium">
            Dagsetning staðfestingar VSK
          </label>

          <IcelandicDateInput
            name="vatConfirmedAt"
            defaultValue={
              company.vatConfirmedAt
                ? new Date(company.vatConfirmedAt)
                    .toISOString()
                    .slice(0, 10)
                : ""
            }
          />
        </div>
</div>
)}
</div>

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
          />

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
          label="Skráð starfsemi hjá RSK"
          name="rskRegisteredActivities"
          defaultValue={
            company.rskRegisteredActivities ?? ""
          }
        />

        <TextInput
          label="Raunveruleg virk starfsemi"
          name="activeActivities"
          defaultValue={company.activeActivities ?? ""}
        />

        <p className="-mt-3 text-sm text-slate-500">
  Skráðu þá starfsemi sem fyrirtækið stundar í raun.
</p>

        <TextInput
          label="Upplýsingar um starfsemi staðfestar af"
          name="activitiesConfirmedBy"
          defaultValue={
            company.activitiesConfirmedBy ?? ""
          }
        />

        <div>
          <label className="mb-1 block font-medium">
            Starfsemi staðfest þann
          </label>

          <IcelandicDateInput
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