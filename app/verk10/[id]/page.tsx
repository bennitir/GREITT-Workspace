import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LegacyVerk10DetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/verk/${id}`);
}
