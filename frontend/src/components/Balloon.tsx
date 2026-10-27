/** Problem letter chip; fills with the problem's balloon colour once solved. */
export default function Balloon({ letter, color, solved, size = 'md' }: {
  letter: string; color: string; solved?: boolean; size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`balloon balloon-${size} ${solved ? 'is-solved' : ''}`}
      style={{ ['--balloon' as string]: color }}
      aria-label={`Problem ${letter}${solved ? ', solved' : ''}`}
    >
      {letter}
    </span>
  );
}
