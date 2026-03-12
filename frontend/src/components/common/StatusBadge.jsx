import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../utils/statusConfig';

export function StatusBadge({ status, small }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#555', bg: '#f0f0f0' };
  const size = small ? { padding: '1px 7px', fontSize: 11 } : { padding: '2px 9px', fontSize: 12 };
  return (
    <span style={{ ...size, borderRadius: 3, background: cfg.bg, color: cfg.color, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || { label: priority, color: '#555' };
  return <span style={{ color: cfg.color, fontWeight: 600, fontSize: 13 }}>{cfg.label}</span>;
}
