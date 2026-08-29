"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setActiveCompanyFromAdmin } from "@/app/actions/companyActions";
import Button from "@/components/ui/Button";

export default function AdminOpenCompanyButton({
  companyId,
}: {
  companyId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await setActiveCompanyFromAdmin(companyId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Opna..." : "Opna fyrirtæki"}
    </Button>
  );
}