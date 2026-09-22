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
import { companyEditText } from "@/lib/i18n/company-edit";

type Company = {
  id: number;
  name: string;
  kennitala: string;
  address: string;
  phone: string;
  email: string;
  contact: string;

  defaultOperationalLocation: {
    id: number;
    code: string;
    name: string;
    address: string | null;
    postalCode: string | null;
    city: string | null;
  } | null;

  vatNumber: string | null;
  vatRegistered: boolean | null;
  vatRegistrationDate: Date | null;
  vatSettlementType: string | null;
  vatDataSource: string | null;
  vatDataUpdatedAt: Date | null;
  vatConfirmedAt: Date | null;
  vatConfirmedBy: string | null;
  payrollRegistered: boolean | null;
  payrollRegistrationDate: Date | null;
  payrollDataSource: string | null;
  payrollDataUpdatedAt: Date | null;
  payrollConfirmedAt: Date | null;
  payrollConfirmedBy: string | null;

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
  language: string;
};

export default function CompanyEditForm({
  company,
  language,
}: Props) {
  const t = companyEditText(language);
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

  const [payrollRegistered, setPayrollRegistered] = useState<"" | "YES" | "NO">(company.payrollRegistered === true ? "YES" : company.payrollRegistered === false ? "NO" : "");

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
      t.voucherError
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
      t.activityError
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

      defaultWorkLocation: {
        name: String(formData.get("defaultWorkLocationName") ?? "").trim(),
        address: String(formData.get("defaultWorkLocationAddress") ?? "").trim(),
        postalCode: String(formData.get("defaultWorkLocationPostalCode") ?? "").trim(),
        city: String(formData.get("defaultWorkLocationCity") ?? "").trim(),
      },

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

      payrollRegistered: payrollRegistered === "YES" ? true : payrollRegistered === "NO" ? false : null,
      payrollRegistrationDate: payrollRegistered === "YES" && formData.get("payrollRegistrationDate") ? new Date(String(formData.get("payrollRegistrationDate"))) : null,
      payrollDataSource: payrollRegistered === "YES" ? String(formData.get("payrollDataSource") || "") || null : null,
      payrollConfirmedBy: payrollRegistered === "YES" ? String(formData.get("payrollConfirmedBy") || "") || null : null,
      payrollConfirmedAt: payrollRegistered === "YES" && formData.get("payrollConfirmedAt") ? new Date(String(formData.get("payrollConfirmedAt"))) : null,

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

    setMessage(t.saved);
  } catch (error) {
    console.error(
      "Villa við vistun fyrirtækis:",
      error
    );

    setMessage(
      t.saveError
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
        label={t.name}
        name="name"
        defaultValue={company.name}
      />

      <TextInput
        label={t.id}
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
        label={t.address}
        name="address"
        defaultValue={company.address}
      />

      <PhoneInput
        label={t.phone}
        name="phone"
        defaultValue={company.phone}
      />

      <TextInput
        label={t.email}
        name="email"
        type="email"
        defaultValue={company.email}
      />

      <TextInput
        label={t.contact}
        name="contact"
        defaultValue={company.contact}
      />

      <div className="border-t pt-5">
        <h2 className="text-lg font-semibold">{t.workBaseTitle}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{t.workBaseHelp}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2">
            <span className="font-medium">{t.workBaseName}</span>
            <input
              name="defaultWorkLocationName"
              maxLength={160}
              defaultValue={company.defaultOperationalLocation?.name ?? ""}
              placeholder={t.workBaseNamePlaceholder}
              className="rounded border p-2"
            />
          </label>

          <label className="grid gap-1 sm:col-span-2">
            <span className="font-medium">{t.workBaseAddress}</span>
            <input
              name="defaultWorkLocationAddress"
              maxLength={240}
              defaultValue={company.defaultOperationalLocation?.address ?? company.address}
              className="rounded border p-2"
            />
          </label>

          <label className="grid gap-1">
            <span className="font-medium">{t.workBasePostalCode}</span>
            <input
              name="defaultWorkLocationPostalCode"
              maxLength={20}
              defaultValue={company.defaultOperationalLocation?.postalCode ?? ""}
              className="rounded border p-2"
            />
          </label>

          <label className="grid gap-1">
            <span className="font-medium">{t.workBaseCity}</span>
            <input
              name="defaultWorkLocationCity"
              maxLength={120}
              defaultValue={company.defaultOperationalLocation?.city ?? ""}
              className="rounded border p-2"
            />
          </label>
        </div>
      </div>

      <div className="border-t pt-5">
        <h2 className="mb-4 text-lg font-semibold">
          VSK
        </h2>

        <div className="space-y-2">
          <label className="block font-medium">
            {t.vatRegistration}
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
              {t.unconfirmed}
            </option>

            <option value="YES">
              {t.yesVat}
            </option>

            <option value="NO">
              {t.noVat}
            </option>
          </select>
        </div>

        {vatRegistered === "YES" && (
          <div className="mt-5 space-y-5">
            <TextInput
              label={t.vatNumber}
              name="vatNumber"
              defaultValue={
                company.vatNumber ?? ""
              }
            />

            <div>
              <label className="mb-1 block font-medium">
                {t.vatDate}
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
                {t.vatType}
              </label>

              <select
                name="vatSettlementType"
                defaultValue={
                  company.vatSettlementType ?? ""
                }
                className="block w-full rounded border p-2"
              >
                <option value="">
                  {t.unconfirmed}
                </option>

                <option value="BIMONTHLY">
                  {t.bimonthly}
                </option>

                <option value="ANNUAL">
                  {t.annual}
                </option>

                <option value="MONTHLY">
                  {t.monthly}
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block font-medium">
                {t.sourceVat}
              </label>

              <select
                name="vatDataSource"
                defaultValue={
                  company.vatDataSource ?? ""
                }
                className="block w-full rounded border p-2"
              >
                <option value="">
                  {t.notRecorded}
                </option>

                <option value="MANUAL">
                  {t.manual}
                </option>

                <option value="RSK">
                  {t.rsk}
                </option>

                <option value="IMPORT">
                  {t.imported}
                </option>
              </select>
            </div>

            <TextInput
              label={t.vatConfirmedBy}
              name="vatConfirmedBy"
              defaultValue={
                company.vatConfirmedBy ?? ""
              }
            />

            <div>
              <label className="mb-1 block font-medium">
                {t.vatConfirmedAt}
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
        <h2 className="mb-1 text-lg font-semibold">{t.payroll}</h2>
        <p className="mb-4 text-sm text-slate-500">{t.payrollHelp}</p>
        <div className="space-y-2">
          <label className="block font-medium">{t.payrollRegistration}</label>
          <select name="payrollRegistered" value={payrollRegistered} onChange={(e) => setPayrollRegistered(e.target.value as "" | "YES" | "NO")} className="block w-full rounded border p-2">
            <option value="">{t.unconfirmed}</option><option value="YES">{t.yesPayroll}</option><option value="NO">{t.noPayroll}</option>
          </select>
        </div>
        {payrollRegistered === "YES" && <div className="mt-5 space-y-5">
          <div><label className="mb-1 block font-medium">{t.payrollDate}</label><IcelandicDateInput name="payrollRegistrationDate" submitFormat="iso" defaultValue={company.payrollRegistrationDate ? new Date(company.payrollRegistrationDate).toISOString().slice(0, 10) : ""} /></div>
          <div className="space-y-2"><label className="block font-medium">{t.payrollSource}</label><select name="payrollDataSource" defaultValue={company.payrollDataSource ?? ""} className="block w-full rounded border p-2"><option value="">{t.notRecorded}</option><option value="MANUAL">{t.manual}</option><option value="RSK">{t.rsk}</option><option value="IMPORT">{t.imported}</option></select></div>
          <TextInput label={t.payrollConfirmedBy} name="payrollConfirmedBy" defaultValue={company.payrollConfirmedBy ?? ""} />
          <div><label className="mb-1 block font-medium">{t.payrollConfirmedAt}</label><IcelandicDateInput name="payrollConfirmedAt" submitFormat="iso" defaultValue={company.payrollConfirmedAt ? new Date(company.payrollConfirmedAt).toISOString().slice(0, 10) : ""} /></div>
        </div>}
      </div>

      <div className="border-t pt-5">
        <h2 className="mb-4 text-lg font-semibold">{t.accounting}</h2>

        <div>
          <label className="mb-1 block font-medium">
            {t.nextVoucher}
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
            {t.nextVoucherHelp}
          </p>
        </div>
      </div>

      <div className="border-t pt-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {t.activities}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {t.activitiesHelp}
            </p>
          </div>
        </div>

        {hasLegacyActivityData &&
          activities.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">
                {t.legacyTitle}
              </p>

              <p className="mt-1 text-sm text-amber-800">
                {t.legacyHelp}
              </p>

              {company.rskRegisteredActivities && (
                <div className="mt-3 text-sm text-amber-900">
                  <span className="font-medium">
                    {t.oldRsk}
                  </span>{" "}
                  {company.rskRegisteredActivities}
                </div>
              )}

              {company.activeActivities && (
                <div className="mt-2 text-sm text-amber-900">
                  <span className="font-medium">
                    {t.oldActive}
                  </span>{" "}
                  {company.activeActivities}
                </div>
              )}
            </div>
          )}

        <div className="space-y-4">
          {activities.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
              {t.noActivities}
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
                      {t.code}
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
                      {t.activityName}
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

                    {t.registeredRsk}
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

                    {t.activeActivity}
                  </label>

                  {isRskManaged ? (
                    <span className="ml-auto rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
                      {t.originRsk}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        removeActivity(index)
                      }
                      className="ml-auto rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      {t.remove}
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
          {t.addActivity}
        </button>

        <div className="mt-6 space-y-5">
          <TextInput
            label={t.activitiesConfirmedBy}
            name="activitiesConfirmedBy"
            defaultValue={
              company.activitiesConfirmedBy ?? ""
            }
          />

          <div>
            <label className="mb-1 block font-medium">
              {t.activitiesConfirmedAt}
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
              {t.certificate}
            </label>

            <input
              type="file"
              name="rskCertificate"
              accept=".pdf"
              className="block w-full rounded border p-2"
            />

            {company.rskCertificatePath && (
              <p className="mt-2 text-sm text-green-700">
                {t.certificateExists}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving}>
  {saving ? t.saving : t.save}
</Button>

      {message && (
        <p className="font-medium text-green-700">
          {message}
        </p>
      )}
    </form>
  );
}