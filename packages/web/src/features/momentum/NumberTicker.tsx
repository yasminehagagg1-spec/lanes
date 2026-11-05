import { motion } from 'motion/react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SPRING = { type: 'spring', stiffness: 120, damping: 18 } as const;

/** One odometer wheel. Width comes from the real digit, so proportional fonts still look right. */
function Wheel({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block overflow-hidden align-baseline">
      <span className="invisible">{digit}</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={SPRING}
      >
        {DIGITS.map((d) => (
          <span key={d} aria-hidden="true">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Digit-by-digit rolling number ("3.5" → "4"). Non-digits render as-is. */
export function NumberTicker({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={className} aria-label={value} role="img">
      {chars.map((ch, i) => {
        // Key from the right so the ones digit keeps its wheel as the number grows.
        const key = chars.length - i;
        return /\d/.test(ch) ? (
          <Wheel key={`d${key}`} digit={Number(ch)} />
        ) : (
          <span key={`c${key}`} aria-hidden="true">
            {ch}
          </span>
        );
      })}
    </span>
  );
}
