/** Typography wrapper for long-form static pages (about, privacy, terms). */
export function Prose({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>}
      <div className="mt-8 grid gap-4 leading-relaxed text-foreground/90 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
        {children}
      </div>
    </article>
  );
}
