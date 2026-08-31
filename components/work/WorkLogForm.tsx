"use client";

import { useState } from "react";
import IcelandicTimeInput from "@/components/ui/IcelandicTimeInput";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import Button from "@/components/ui/Button";
import { createWorkLog } from "@/app/actions/workActions";

type CompanyUser = {
  user: {
    id: number;
    name: string;
  };
};

type Props = {
  workOrderId: number;
  companyUsers: CompanyUser[];
};

  export default function WorkLogForm({
  workOrderId,
  companyUsers,
}: Props) {
  const [formKey, setFormKey] = useState(0);

  async function handleCreateWorkLog(formData: FormData) {
    await createWorkLog(formData);

    setFormKey((current) => current + 1);
  }

  return (
    <form
  key={formKey}
  action={handleCreateWorkLog}
  className="space-y-4"
>
      <input
        type="hidden"
        name="workOrderId"
        value={workOrderId}
      />

      <div>
        <label className="block text-sm font-medium">
          Starfsmaður
        </label>

        <select
          name="userId"
          className="mt-1 w-full rounded-lg border px-3 py-2"
          defaultValue=""
        >
          <option value="">Veldu starfsmann</option>

          {companyUsers.map((companyUser) => (
            <option
              key={companyUser.user.id}
              value={companyUser.user.id}
            >
              {companyUser.user.name}
            </option>
          ))}
        </select>
      </div>

      <div className="w-72">
  <label className="block text-sm font-medium">
    Dagsetning
  </label>

  <IcelandicDateInput
    name="workDate"
    required
    submitFormat="iso"
  />
</div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">
            Frá
          </label>

          <IcelandicTimeInput name="startedAt" />
        </div>

        <div>
          <label className="block text-sm font-medium">
            Til
          </label>

          <IcelandicTimeInput name="endedAt" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">
          Hlé í mínútum
        </label>

        <input
          type="number"
          name="breakMinutes"
          min="0"
          defaultValue="0"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">
          Lýsing
        </label>

        <textarea
          name="description"
          rows={3}
          className="mt-1 w-full rounded-lg border px-3 py-2"
          placeholder="Hvað var unnið?"
        />
      </div>

      <Button type="submit">
        Vista verkstund
      </Button>
    </form>
  );
}