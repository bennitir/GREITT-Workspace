import CustomerCreateForm from "@/components/CustomerCreateForm";

export default function NyttVidskiptavinurPage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">
        Nýr viðskiptavinur
      </h1>

      <CustomerCreateForm />
    </main>
  );
}