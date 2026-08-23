"use client";

import { useRouter } from "next/navigation";
import { reactivateCompany } from "@/app/actions/companyActions";

type Props = {
  id: number;
};

export default function ReactivateCompanyButton({ id }: Props) {
  const router = useRouter();

  async function handleReactivate() {
    const confirmed = window.confirm(
      "Viltu virkja fyrirtækið aftur? Þá verður aftur hægt að vinna með bókhald og fylgiskjöl þess."
    );

    if (!confirmed) {
      return;
    }

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
      Virkja fyrirtæki aftur
    </button>
  );
}