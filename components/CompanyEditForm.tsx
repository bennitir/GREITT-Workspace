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

  activities: {
    id: number;
    companyId: number;
    code: string | null;
    name: string;
    registeredAtRsk: boolean;
    isActive: boolean;
    dataSource: string | null;
    dataUpdatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
};

type ActivityFormRow = {
  id: number | null;
  code: string;
  name: string;
  registeredAtRsk: boolean;
  isActive: boolean;
  dataSource: string | null;
};

type Props = {
  company: Company;
};

export default function CompanyEditForm({
  company,
}: Props) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [activities, setActivities] = useState<
    ActivityFormRow[]
  >(
    company.activities.map((activity) => ({
      id: activity.id,
      code: activity.code ?? "",
      name: activity.name,
      registeredAtRsk: activity.registeredAtRsk,
      isActive: activity.isActive,
      dataSource: activity.dataSource,
    }))
  );

  const [vatRegistered, setVatRegistered] = useState<
    "" | "YES" | "NO"
  >(
    company.vatRegistered === true
      ? "YES"
      : company.vatRegistered === false
        ? "NO"
        : ""
  );

  function addActivity() {
    setActivities((current) => [
      ...current,
      {
        id: null,
        code: "",
        name: "",
        registeredAtRsk: false,
        isActive: true,
        dataSource: "MANUAL",
      },
    ]);
  }

  function updateActivity(
    index: number,
    changes: Partial<ActivityFormRow>
  ) {
    setActivities((current) =>
      current.map((activity, activityIndex) =>
        activityIndex === index
          ? {
              ...activity,
              ...changes,
            }
          : activity
      )
    );
  }

  function removeActivity(index: number) {
    setActivities((current) =>
      current.filter(
        (_, activityIndex) => activityIndex !== index
      )
    );
  }

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

  const invalidActivity = activities.find(
    (activity) =>
      activity.code.trim() !== "" &&
      activity.name.trim() === ""
  );

  if (invalidActivity) {
    setMessage(
      "Heiti starfsemi vantar við skráðan starfsemiskóða."
    );
    return;
  }

  const cleanedActivities = activities
    .map((activity) => ({
      id: activity.id,
      code: activity.code.trim(),
      name: activity.name.trim(),
      registeredAtRsk: activity.registeredAtRsk,
      isActive: activity.isActive,
    }))
    .filter(
      (activity) =>
        activity.code !== "" || activity.name !== ""
    );

  const vatRegisteredValue = String(
    formData.get("vatRegistered") ?? ""
  );

  const vatRegistered =
    vatRegisteredValue === "YES"
      ? true
      : vatRegisteredValue === "NO"
        ? false
        : null;

  const hasVatRegistration =
    vatRegistered === true;

  const vatStatusUnconfirmed =
    vatRegistered === null;

  setSaving(true);

  try {
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
        ? String(formData.get("vatNumber") || "") ||
          null
        : vatStatusUnconfirmed
          ? company.vatNumber
          : null,

      vatRegistered,

      vatRegistrationDate: hasVatRegistration
        ? formData.get("vatRegistrationDate")
          ? new Date(
              String(
                formData.get("vatRegistrationDate")
              )
            )
          : null
        : vatStatusUnconfirmed
          ? company.vatRegistrationDate
          : null,

      vatSettlementType: hasVatRegistration
        ? String(
            formData.get("vatSettlementType") || ""
          ) || null
        : vatStatusUnconfirmed
          ? company.vatSettlementType
          : null,

      vatDataSource: hasVatRegistration
        ? String(
            formData.get("vatDataSource") || ""
          ) || null
        : vatStatusUnconfirmed
          ? company.vatDataSource
          : null,

      vatConfirmedAt: hasVatRegistration
        ? formData.get("vatConfirmedAt")
          ? new Date(
              String(formData.get("vatConfirmedAt"))
            )
          : null
        : vatStatusUnconfirmed
          ? company.vatConfirmedAt
          : null,

      vatConfirmedBy: hasVatRegistration
        ? String(
            formData.get("vatConfirmedBy") || ""
          ) || null
        : vatStatusUnconfirmed
          ? company.vatConfirmedBy
          : null,

      nextVoucherNumber,

      activitiesConfirmedBy:
        String(
          formData.get("activitiesConfirmedBy") || ""
        ) || null,

      activitiesConfirmedAt: formData.get(
        "activitiesConfirmedAt"
      )
        ? new Date(
            String(
              formData.get("activitiesConfirmedAt")
            )
          )
        : null,

      rskCertificatePath:
        company.rskCertificatePath,

      activities: cleanedActivities,
    });

    if (
      rskCertificate &&
      rskCertificate.size > 0
    ) {
      await uploadRskCertificate(
        company.id,
        rskCertificate
      );
    }

    setMessage("✓ Breytingar vistaðar");
  } catch (error) {
    console.error(
      "Villa við vistun fyrirtækis:",
      error
    );

    setMessage(
      "Ekki tókst að vista breytingarnar. Reyndu aftur."
    );
  } finally {
    setSaving(false);
  }
}
  const hasLegacyActivityData =
    Boolean(company.rskRegisteredActivities) ||
    Boolean(company.activeActivities);

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
                event.target.value as
                  | ""
                  | "YES"
                  | "NO"
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
          <div className="mt-5 space-y-5">
            <TextInput
              label="VSK-númer"
              name="vatNumber"
              defaultValue={
                company.vatNumber ?? ""
              }
            />

            <div>
              <label className="mb-1 block font-medium">
                Skráningardagur VSK
              </label>

              <IcelandicDateInput
  name="vatRegistrationDate"
  submitFormat="iso"
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
                defaultValue={
                  company.vatDataSource ?? ""
                }
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
              defaultValue={
                company.vatConfirmedBy ?? ""
              }
            />

            <div>
              <label className="mb-1 block font-medium">
                Dagsetning staðfestingar VSK
              </label>

              <IcelandicDateInput
  name="vatConfirmedAt"
  submitFormat="iso"
  defaultValue={
                  company.vatConfirmedAt
                    ? new Date(
                        company.vatConfirmedAt
                      )
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
            defaultValue={
              company.nextVoucherNumber
            }
            readOnly
            className="block w-full rounded border bg-slate-100 p-2 text-slate-600"
          />

          <p className="mt-1 text-sm text-slate-500">
            Næsta samþykkta fylgiskjal fær þetta
            númer.
          </p>
        </div>
      </div>

      <div className="border-t pt-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Starfsemi
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Fyrirtæki getur haft margar
              starfsemisgreinar. Merktu sérstaklega
              hvaða greinar eru skráðar hjá RSK og
              hvaða starfsemi er virk.
            </p>
          </div>
        </div>

        {hasLegacyActivityData &&
          activities.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">
                Eldri starfsemisskráning fannst
              </p>

              <p className="mt-1 text-sm text-amber-800">
                Gömlu upplýsingarnar hafa ekki verið
                fluttar sjálfkrafa yfir í nýja
                starfsemislistann. Farðu yfir þær og
                skráðu réttar starfsemisgreinar hér
                fyrir neðan.
              </p>

              {company.rskRegisteredActivities && (
                <div className="mt-3 text-sm text-amber-900">
                  <span className="font-medium">
                    Eldra gildi – skráð hjá RSK:
                  </span>{" "}
                  {company.rskRegisteredActivities}
                </div>
              )}

              {company.activeActivities && (
                <div className="mt-2 text-sm text-amber-900">
                  <span className="font-medium">
                    Eldra gildi – virk starfsemi:
                  </span>{" "}
                  {company.activeActivities}
                </div>
              )}
            </div>
          )}

        <div className="space-y-4">
          {activities.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
              Engin starfsemisgrein hefur verið
              skráð enn.
            </div>
          )}

          {activities.map(
            (activity, index) => {
              const isRskManaged =
                activity.dataSource === "RSK" &&
                activity.registeredAtRsk;

              return (
              <div
                key={
                  activity.id ??
                  `new-activity-${index}`
                }
                className="rounded-lg border bg-slate-50 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Kóði
                    </label>

                    <input
                      type="text"
                      value={activity.code}
                      onChange={(event) =>
                        updateActivity(index, {
                          code: event.target.value,
                        })
                      }
                      placeholder="t.d. 69.20.0"
                      readOnly={isRskManaged}
                      className={`block w-full rounded border p-2 ${
                        isRskManaged
                          ? "bg-slate-100 text-slate-600"
                          : "bg-white"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Heiti starfsemi
                    </label>

                    <input
                      type="text"
                      value={activity.name}
                      onChange={(event) =>
                        updateActivity(index, {
                          name: event.target.value,
                        })
                      }
                      placeholder="t.d. Reikningshald og bókhald"
                      readOnly={isRskManaged}
                      className={`block w-full rounded border p-2 ${
                        isRskManaged
                          ? "bg-slate-100 text-slate-600"
                          : "bg-white"
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        activity.registeredAtRsk
                      }
                      onChange={(event) => {
                        if (isRskManaged) {
                          return;
                        }

                        updateActivity(index, {
                          registeredAtRsk:
                            event.target.checked,
                        });
                      }}
                      disabled={isRskManaged}
                      className="h-4 w-4"
                    />

                    Skráð hjá RSK
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={activity.isActive}
                      onChange={(event) =>
                        updateActivity(index, {
                          isActive:
                            event.target.checked,
                        })
                      }
                      className="h-4 w-4"
                    />

                    Virk starfsemi
                  </label>

                  {isRskManaged ? (
                    <span className="ml-auto rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
                      Uppruni: RSK
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        removeActivity(index)
                      }
                      className="ml-auto rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Fjarlægja
                    </button>
                  )}
                </div>
              </div>
              );
            }
          )}
        </div>

        <button
          type="button"
          onClick={addActivity}
          className="mt-4 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          + Bæta við starfsemi
        </button>

        <div className="mt-6 space-y-5">
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
  submitFormat="iso"
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
              Staðfest vottorð frá RSK
              (valkvætt)
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
      </div>

      <Button type="submit" disabled={saving}>
  {saving ? "Vista..." : "Vista breytingar"}
</Button>

      {message && (
        <p className="font-medium text-green-700">
          {message}
        </p>
      )}
    </form>
  );
}