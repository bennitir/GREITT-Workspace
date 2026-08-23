"use client";

import { useRouter } from "next/navigation";

type Props = {
  href: string;
  children: React.ReactNode;
};

export default function BookedDocumentRow({
  href,
  children,
}: Props) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer hover:bg-slate-100"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          router.push(href);
        }
      }}
    >
      {children}
    </tr>
  );
}