import { times } from './format';

export const OUTLIER_AT = 3;

/* A multiplier; at 3× or more it gets circled in red pencil, the one mark this desk reserves for outliers. */
export function OutlierMark({ value }: { value: number | null | undefined }) {
  const outlier = value != null && value >= OUTLIER_AT;
  return (
    <span className="relative inline-flex items-center px-1.5 py-0.5">
      <span className={outlier ? 'num font-medium text-pencil' : 'num'}>{times(value)}</span>
      {outlier ? (
        <>
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] overflow-visible"
          >
            <path
              className="pencil-loop"
              pathLength={260}
              d="M88 9C70 1 22 2 8 14C-2 24 14 37 50 37C84 37 99 27 93 15C89 7 74 4 62 4"
              fill="none"
              stroke="var(--pencil)"
              strokeWidth="1.6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="sr-only"> (outlier)</span>
        </>
      ) : null}
    </span>
  );
}
