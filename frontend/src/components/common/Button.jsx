export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, loading, style, type = 'button' }) {
  const variants = {
    primary: { background: 'var(--accent-blue)', color: '#fff', border: 'none' },
    secondary: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-light)' },
    danger: { background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' },
    watson: { background: 'linear-gradient(135deg, #0062ff, #8b5cf6)', color: '#fff', border: 'none' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: 'none' },
  };
  const sizes = { sm: { padding: '5px 12px', fontSize: 12 }, md: { padding: '8px 16px', fontSize: 13 }, lg: { padding: '11px 24px', fontSize: 14 } };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...variants[variant], ...sizes[size], borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'var(--transition)', fontFamily: 'inherit', ...style }}>
      {loading ? <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : null}
      {children}
    </button>
  );
}
