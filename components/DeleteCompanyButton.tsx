"use client";

import { deleteCompany, deactivateCompany } from "@/app/actions/companyActions";
import { useRouter } from "next/navigation";
import { adminText } from "@/lib/i18n/admin";

type Props = {
  id: number;
  hasBookkeepingData: boolean;
  language?: string | null;
};

export default function DeleteCompanyButton({
  id,
  hasBookkeepingData,
  language = "is",
}: Props) {
  const router = useRouter();
  const t = adminText(language).companyButtons;

  async function handleDelete() {
    if (hasBookkeepingData) {
      const confirmed = window.confirm(t.deactivateConfirm);
      if (!confirmed) return;

      await deactivateCompany(id);
      router.push("/fyrirtaeki");
      router.refresh();
      return;
    }

    const confirmed = window.confirm(t.deleteConfirm);
    if (!confirmed) return;

    const reallyConfirmed = window.confirm(t.deleteConfirmFinal);
    if (!reallyConfirmed) return;

    await deleteCompany(id);
    router.push("/fyrirtaeki");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      {hasBookkeepingData ? t.deactivate : t.delete}
    </button>
  );
}
