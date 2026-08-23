import Image from "next/image";

type PrototypeSection = {
  title: string;
  description: string;
};

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  imageSrc?: string;
  imageAlt?: string;
  sections: PrototypeSection[];
  note: string;
};

export default function ModulePrototype({
  eyebrow,
  title,
  intro,
  imageSrc,
  imageAlt,
  sections,
  note,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{title}</h1>
          <p className="mt-3 max-w-4xl text-lg leading-8 text-slate-600">{intro}</p>
        </header>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
          <strong>Frumgerð:</strong> Þessi síða er ætluð til að gramsa í og móta vinnuferlið áður en við festum fulla virkni í gagnagrunninn.
        </div>

        {imageSrc ? (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <Image
              src={imageSrc}
              alt={imageAlt ?? title}
              width={1536}
              height={1024}
              className="h-auto w-full"
              priority
            />
          </div>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">{section.title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{section.description}</p>
            </article>
          ))}
        </section>

        <footer className="rounded-2xl border bg-white p-6 text-slate-700 shadow-sm">
          <strong>Næsta yfirferð:</strong> {note}
        </footer>
      </div>
    </div>
  );
}
