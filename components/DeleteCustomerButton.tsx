"use client";

import { deleteCustomer } from "@/app/actions/customerActions";
import { useRouter } from "next/navigation";

type Props = {
  id: number;
};

export default function DeleteCustomerButton({ id }: Props) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = window.confirm(
      "Ertu viss um að þú viljir eyða þessum viðskiptavini?"
    );

    if (!confirmed) {
      return;
    }

    await deleteCustomer(id);

    router.push("/vidskiptavinir");
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Eyða viðskiptavini
    </button>
  );
}