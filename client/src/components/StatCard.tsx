interface StatCardProps { label: string; value: string; tone?: 'primary' | 'accent' | 'success' }
export function StatCard({ label, value, tone = 'primary' }: StatCardProps): JSX.Element {
  return <article className={`stat-card tone-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}
