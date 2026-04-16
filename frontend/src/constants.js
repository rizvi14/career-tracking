export const STATUSES = [
  { value: 'Application',    color: '#3B82F6' }, // blue
  { value: 'Phone Screen',   color: '#8B5CF6' }, // purple
  { value: 'Hiring Manager', color: '#6366F1' }, // indigo
  { value: 'Presentation',   color: '#F59E0B' }, // amber
  { value: 'Panel',          color: '#F97316' }, // orange
  { value: 'Final',          color: '#EC4899' }, // pink
  { value: 'Offer',          color: '#10B981' }, // emerald
  { value: 'Rejected',       color: '#6B7280' }, // gray
  { value: 'Withdrew',        color: '#94A3B8' }, // slate
  { value: 'Position Filled', color: '#DC2626' }, // red
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
