/** Royal square, white "L", yellow hand-drawn swoosh. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <rect width="44" height="44" rx="12" className="fill-royal" />
      <path
        d="M15 10 V29 H29"
        fill="none"
        strokeWidth="6"
        strokeLinecap="square"
        className="stroke-white"
      />
      <path
        d="M10 35 C 18 31.5, 26 31, 33 33"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        className="stroke-yellow"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[1.0625rem] font-semibold">Lanes</div>
        <div lang="ar" className="text-fg-2 text-sm">
          مسارات
        </div>
      </div>
    </div>
  );
}
