import Link from "next/link";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      {/* Console pages mark themselves data-wide so the header lines up with their 960px column. */}
      <div className="mx-auto flex max-w-[560px] [body:has([data-wide])_&]:max-w-[960px] flex-wrap items-center justify-between gap-2 px-4 py-1">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-md focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
