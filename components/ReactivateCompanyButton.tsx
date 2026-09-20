"use client";

import { useRouter } from "next/navigation";
import { reactivateCompany } from "@/app/actions/companyActions";
import { adminText } from "@/lib/i18n/admin";

type Props = {
  id: number;
  language?: string | null;
};

export default function ReactivateCompanyButton({ id, language = "is" }: Props) {
  const router = useRouter();
  const t = adminText(language).companyButtons;

  async function handleReactivate() {
    const confirmed = window.confirm(t.reactivateConfirm);
    if (!confirmed) return;

    await reactivateCompany(id);
    router.push(`/fyrirtaeki/${id}`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleReactivate}
      className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
    >
      {t.reactivate}
    </button>
  );
}
