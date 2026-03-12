const TYPE_CFG = {
  'ESXi Host':       { color: '#7c3aed', bg: '#f5f3ff', icon: '🖥' },
  'Virtual Machine': { color: '#1d4ed8', bg: '#eff6ff', icon: '💻' },
  'Physical Server': { color: '#0f766e', bg: '#f0fdfa', icon: '🗄' },
  'Application':     { color: '#d97706', bg: '#fffbeb', icon: '⚙' },
  'Database':        { color: '#dc2626', bg: '#fef2f2', icon: '🗃' },
  'Middleware':      { color: '#0369a1', bg: '#f0f9ff', icon: '🔗' },
  'Container/Pod':   { color: '#059669', bg: '#f0fdf4', icon: '📦' },
  'Network Device':  { color: '#9333ea', bg: '#faf5ff', icon: '🌐' },
  'Storage':         { color: '#92400e', bg: '#fef3c7', icon: '💾' },
  'Other':           { color: '#6b7280', bg: '#f9fafb', icon: '🔧' },
};

export function CITypeBadge({ type, small }) {
  const cfg = TYPE_CFG[type] || TYPE_CFG['Other'];
  const size = small ? { padding: '1px 6px', fontSize: 11 } : { padding: '2px 8px', fontSize: 12 };
  return (
    <span style={{ ...size, borderRadius: 3, background: cfg.bg, color: cfg.color, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: small ? 10 : 11 }}>{cfg.icon}</span> {type}
    </span>
  );
}

export function CIStatusDot({ status }) {
  const colors = { Operational: '#16a34a', Maintenance: '#d97706', Decommissioned: '#dc2626', Planned: '#6b7280' };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: colors[status] || '#555' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[status] || '#555', display: 'inline-block', boxShadow: `0 0 4px ${colors[status] || '#555'}` }} />
    {status}
  </span>;
}

export function CriticalityBadge({ level }) {
  const cfg = { Critical: '#dc2626', High: '#d97706', Medium: '#2563eb', Low: '#16a34a' };
  return <span style={{ fontSize: 11, fontWeight: 700, color: cfg[level] || '#555', letterSpacing: '0.03em' }}>{level}</span>;
}
