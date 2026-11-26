import { notFound } from "next/navigation";

// Legacy Customer records have no company scope; do not render or edit them.
export default function LegacyCustomerClosedPage() {
  notFound();
}
