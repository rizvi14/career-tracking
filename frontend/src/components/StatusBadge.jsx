import { STATUS_MAP } from '../constants';

export default function StatusBadge({ status, muted = false }) {
  const s = STATUS_MAP[status];
  if (!s) return <span className="text-xs text-gray-500">{status}</span>;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={
        muted
          ? { backgroundColor: '#F3F4F6', color: '#9CA3AF', borderColor: '#E5E7EB' }
          : { backgroundColor: s.color + '1a', color: s.color, borderColor: s.color + '40' }
      }
    >
      {status}
    </span>
  );
}
