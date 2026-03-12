export function Card({ children, style, onClick, className }) {
  return (
    <div onClick={onClick} className={className} style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: 20,
      transition: 'var(--transition)',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }} onMouseEnter={e => { if(onClick) e.currentTarget.style.borderColor = 'var(--border-light)' }}
       onMouseLeave={e => { if(onClick) e.currentTarget.style.borderColor = 'var(--border)' }}>
      {children}
    </div>
  );
}
