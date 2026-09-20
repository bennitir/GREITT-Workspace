"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setActiveCompanyFromAdmin } from "@/app/actions/companyActions";
import Button from "@/components/ui/Button";
import { adminText } from "@/lib/i18n/admin";

export default function AdminOpenCompanyButton({
  companyId,
  language = "is",
}: {
  companyId: number;
  language?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = adminText(language).companyButtons;

  function handleClick() {
    startTransition(async () => {
      await setActiveCompanyFromAdmin(companyId);
      router.refresh();
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={isPending}>
      {isPending ? t.opening : t.open}
    </Button>
  );
}
