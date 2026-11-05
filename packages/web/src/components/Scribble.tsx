import type { CSSProperties } from 'react';
import arrowDownCurl from '@/assets/scribbles/arrow-down-curl.svg?raw';
import arrowLoop from '@/assets/scribbles/arrow-loop.svg?raw';
import arrowSwoop from '@/assets/scribbles/arrow-swoop.svg?raw';
import checkDraw from '@/assets/scribbles/check-draw.svg?raw';
import circleScribble from '@/assets/scribbles/circle-scribble.svg?raw';
import sparkle from '@/assets/scribbles/sparkle.svg?raw';
import squiggleZ from '@/assets/scribbles/squiggle-z.svg?raw';
import underlineScribble from '@/assets/scribbles/underline-scribble.svg?raw';

const SCRIBBLES = {
  'arrow-down-curl': arrowDownCurl,
  'arrow-loop': arrowLoop,
  'arrow-swoop': arrowSwoop,
  'check-draw': checkDraw,
  'circle-scribble': circleScribble,
  sparkle,
  'squiggle-z': squiggleZ,
  'underline-scribble': underlineScribble,
} as const;

export type ScribbleName = keyof typeof SCRIBBLES;

/**
 * Hand-drawn mark, inlined so it takes `currentColor` — color it with a text-* class.
 * The SVGs are our own static files from design/assets, never user content.
 */
export function Scribble({
  name,
  className,
  style,
  stretch = false,
  draw = false,
}: {
  name: ScribbleName;
  className?: string;
  style?: CSSProperties;
  /** Fill the box instead of keeping proportions (e.g. a circle around text of any width). */
  stretch?: boolean;
  /** Draw the stroke in (pathLength=1, dashoffset 1 → 0). */
  draw?: boolean;
}) {
  let svg: string = SCRIBBLES[name];
  if (stretch) {
    svg = svg
      .replace('<svg ', '<svg preserveAspectRatio="none" ')
      .replaceAll('<path ', '<path vector-effect="non-scaling-stroke" ');
  }
  if (draw) svg = svg.replace(/<path (?![^>]*pathLength)/g, '<path pathLength="1" ');
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`inline-block [&>svg]:h-full [&>svg]:w-full ${draw ? 'lanes-draw' : ''} ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
