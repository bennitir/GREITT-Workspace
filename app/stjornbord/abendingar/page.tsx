import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { updateSuggestionReview } from "@/app/actions/suggestionActions";
import { adminLocale, adminText } from "@/lib/i18n/admin";

export default async function SuggestionsAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sessionToken")?.value;
  const session = token
    ? await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      })
    : null;

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    redirect("/innskraning");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });
  const language = settings?.interfaceLanguage ?? "is";
  const t = adminText(language);
  const locale = adminLocale(language);

  const suggestions = await prisma.suggestion.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      company: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  const statusLabel = t.suggestions.statuses as Record<string, string>;

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t.suggestions.title}</h1>
          <p className="mt-1 text-slate-600">{t.suggestions.subtitle}</p>
        </div>
        <Link href="/stjornbord" className="rounded border bg-white px-4 py-2 font-medium">
          {t.suggestions.back}
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {suggestions.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-slate-600">{t.suggestions.empty}</div>
        ) : (
          suggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{suggestion.company?.name ?? t.suggestions.general}</p>
                  <p className="text-sm text-slate-500">
                    {suggestion.submittedBy.name} · {suggestion.createdAt.toLocaleString(locale)}
                  </p>
                  {suggestion.entityType && suggestion.entityId != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t.suggestions.context}: {suggestion.entityType} #{suggestion.entityId}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
                  {statusLabel[suggestion.status] ?? suggestion.status}
                </span>
              </div>

              <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-slate-900">
                {suggestion.text}
              </div>

              <form action={updateSuggestionReview} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
                <input type="hidden" name="suggestionId" value={suggestion.id} />
                <select name="status" defaultValue={suggestion.status} className="rounded border px-3 py-2">
                  {Object.entries(t.suggestions.statuses).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  name="adminNote"
                  defaultValue={suggestion.adminNote ?? ""}
                  placeholder={t.suggestions.notePlaceholder}
                  className="rounded border px-3 py-2"
                />
                <button type="submit" className="rounded bg-slate-800 px-4 py-2 font-semibold text-white">
                  {t.suggestions.save}
                </button>
              </form>

              {suggestion.reviewedBy && suggestion.reviewedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  {t.suggestions.lastReviewedBy} {suggestion.reviewedBy.name} {suggestion.reviewedAt.toLocaleString(locale)}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
