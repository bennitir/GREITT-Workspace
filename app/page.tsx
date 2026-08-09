import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import CompanyCard from "@/components/CompanyCard";
const stats = [
  { title: "Fyrirtæki", value: "1" },
  { title: "Óbókuð fylgiskjöl", value: "7" },
  { title: "Næsta verkefni", value: "Hagtakn #450" },
];
export default function Home() {
  return (
  
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
      <Sidebar />
        <section className="flex-1 p-10">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900">
              Góðan daginn, Benni
            </h2>

            <p className="mt-2 text-slate-600">
              Velkominn í GREITT Workspace.
            </p>
<div className="grid grid-cols-3 gap-6 mt-10">
  {stats.map((stat) => (
    <StatCard
      key={stat.title}
      title={stat.title}
      value={stat.value}
    />
  ))}
</div>
           <CompanyCard
  name="Sturla Ólafsson"
  pendingDocuments={7}
  />
  </div>
        </section>
      </div>
    </main>
  );
}