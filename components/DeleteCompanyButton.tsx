"use client";
import {
  deleteCompany,
  deactivateCompany,
} from "@/app/actions/companyActions";
import { useRouter } from "next/navigation";

type Props = {
  id: number;
  hasBookkeepingData: boolean;
};

export default function DeleteCompanyButton({
  id,
  hasBookkeepingData,
}: Props) {
  const router = useRouter();

async function handleDelete() {
  if (hasBookkeepingData) {
    const confirmed = window.confirm(
      "Þetta fyrirtæki á bókhaldsgögn og verður því ekki eytt.\n\nViltu gera fyrirtækið óvirkt í staðinn?"
    );

    if (!confirmed) {
      return;
    }

    await deactivateCompany(id);

    router.push("/fyrirtaeki");
    router.refresh();
    return;
  }

  const confirmed = window.confirm(
    "Ertu viss um að þú viljir eyða þessu fyrirtæki?"
  );

  if (!confirmed) {
    return;
  }

  const reallyConfirmed = window.confirm(
    "VARÚÐ: Þetta mun eyða fyrirtækinu og tengdum gögnum þess.\n\nErtu alveg viss um að þú viljir halda áfram?"
  );

  if (!reallyConfirmed) {
    return;
  }

  await deleteCompany(id);

  router.push("/fyrirtaeki");
  router.refresh();
}

  return (
    <button
      onClick={handleDelete}
      className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      {hasBookkeepingData
  ? "Gera fyrirtæki óvirkt"
  : "Eyða fyrirtæki"}
    </button>
  );
}