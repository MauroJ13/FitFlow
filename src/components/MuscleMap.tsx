/**
 * Schematic body illustration (front and back) that highlights the muscles an exercise trains.
 * Drawn in code, so it is always relevant to the exercise, works offline and follows the theme.
 */
type Shape = { m: string; d: [number, number, number, number] }; // ellipse: cx, cy, rx, ry

const FRONT: Shape[] = [
  { m: 'traps', d: [50, 37, 12, 4] },
  { m: 'front_delts', d: [31, 46, 7, 7] }, { m: 'front_delts', d: [69, 46, 7, 7] },
  { m: 'side_delts', d: [25, 49, 4, 7] }, { m: 'side_delts', d: [75, 49, 4, 7] },
  { m: 'chest', d: [42, 53, 9, 7] }, { m: 'chest', d: [58, 53, 9, 7] },
  { m: 'biceps', d: [26, 67, 5, 10] }, { m: 'biceps', d: [74, 67, 5, 10] },
  { m: 'forearms', d: [21, 91, 4.5, 12] }, { m: 'forearms', d: [79, 91, 4.5, 12] },
  { m: 'abs', d: [50, 76, 7.5, 15] },
  { m: 'obliques', d: [39, 78, 3.5, 11] }, { m: 'obliques', d: [61, 78, 3.5, 11] },
  { m: 'hip_flexors', d: [42, 99, 5, 4] }, { m: 'hip_flexors', d: [58, 99, 5, 4] },
  { m: 'abductors', d: [33, 112, 3, 9] }, { m: 'abductors', d: [67, 112, 3, 9] },
  { m: 'quads', d: [41, 128, 7, 21] }, { m: 'quads', d: [59, 128, 7, 21] },
  { m: 'adductors', d: [50, 116, 2.6, 11] },
  { m: 'calves', d: [41, 176, 5, 16] }, { m: 'calves', d: [59, 176, 5, 16] },
];
const BACK: Shape[] = [
  { m: 'traps', d: [150, 41, 13, 7] },
  { m: 'rear_delts', d: [131, 46, 7, 7] }, { m: 'rear_delts', d: [169, 46, 7, 7] },
  { m: 'side_delts', d: [125, 49, 4, 7] }, { m: 'side_delts', d: [175, 49, 4, 7] },
  { m: 'upper_back', d: [150, 56, 11, 7] },
  { m: 'lats', d: [139, 71, 7, 13] }, { m: 'lats', d: [161, 71, 7, 13] },
  { m: 'triceps', d: [126, 67, 5, 10] }, { m: 'triceps', d: [174, 67, 5, 10] },
  { m: 'forearms', d: [121, 91, 4.5, 12] }, { m: 'forearms', d: [179, 91, 4.5, 12] },
  { m: 'lower_back', d: [150, 86, 7, 8] },
  { m: 'glutes', d: [142, 105, 8.5, 9] }, { m: 'glutes', d: [158, 105, 8.5, 9] },
  { m: 'hamstrings', d: [141, 134, 7, 18] }, { m: 'hamstrings', d: [159, 134, 7, 18] },
  { m: 'calves', d: [141, 176, 6, 16] }, { m: 'calves', d: [159, 176, 6, 16] },
];

function Body({ x }: { x: number }) {
  return (
    <g fill="var(--surface-3)" opacity="0.55">
      <circle cx={x} cy={20} r={10} />
      <rect x={x - 22} y={34} width={44} height={70} rx={14} />
      <rect x={x - 32} y={40} width={12} height={66} rx={6} />
      <rect x={x + 20} y={40} width={12} height={66} rx={6} />
      <rect x={x - 19} y={98} width={17} height={98} rx={8} />
      <rect x={x + 2} y={98} width={17} height={98} rx={8} />
    </g>
  );
}

export function MuscleMap({ primary, secondary = [], className }: { primary: string[]; secondary?: string[]; className?: string }) {
  const cardio = primary.includes('heart');
  const fill = (m: string) => (primary.includes(m) ? 'var(--accent)' : secondary.includes(m) ? 'var(--accent-soft)' : 'var(--surface-3)');
  const draw = (s: Shape, i: number) => <ellipse key={i} cx={s.d[0]} cy={s.d[1]} rx={s.d[2]} ry={s.d[3]} fill={fill(s.m)} />;
  return (
    <svg className={className} viewBox="0 0 200 200" role="img" aria-hidden="true">
      <Body x={50} />
      <Body x={150} />
      {FRONT.map(draw)}
      {BACK.map(draw)}
      {cardio && (
        <path d="M46 50c-2.6-3.4-8-1.4-8 2.8 0 4.4 5.2 7.2 8 9.6 2.8-2.4 8-5.2 8-9.6 0-4.2-5.4-6.2-8-2.8z" fill="#ff5d73" stroke="var(--surface)" strokeWidth="1" />
      )}
    </svg>
  );
}
