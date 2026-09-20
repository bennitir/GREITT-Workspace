import { requireCompanyModule } from "@/lib/core/require-company-module";

export default async function MobileReceiptCaptureLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCompanyModule("bokhald");
  return children;
}
