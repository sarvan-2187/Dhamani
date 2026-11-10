import { notFound } from "next/navigation";
import { Showcase } from "./Showcase";

// Developer review page, not user-facing: section labels are plain English on purpose.
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="grid gap-px bg-border lg:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className={`${theme} bg-surface text-ink px-4 py-8`}>
          <div className="mx-auto flex max-w-[560px] flex-col gap-8">
            <h1 className="text-h1 capitalize">{theme}</h1>
            <Showcase />
          </div>
        </section>
      ))}
    </main>
  );
}
