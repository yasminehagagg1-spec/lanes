/**
 * English in mega display type, with the Arabic word layered over its right third:
 * smaller, yellow, rotated −4° (design/DESIGN-SYSTEM.md §3).
 */
export function BilingualTitle({ en, ar }: { en: string; ar: string }) {
  return (
    <h1 className="type-display relative m-0 inline-block text-[length:var(--fs-mega)]">
      <span>{en}</span>
      <span
        lang="ar"
        dir="rtl"
        className="text-yellow pointer-events-none absolute -top-[0.16em] right-[-0.18em] -rotate-[4deg] text-[0.46em] leading-none font-extrabold tracking-normal normal-case"
      >
        {ar}
      </span>
    </h1>
  );
}
