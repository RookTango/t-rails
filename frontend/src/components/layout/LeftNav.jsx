import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileStack, Plus, Cpu, Database, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const sections = [
  {
    label: 'Change Management',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/changes', label: 'All Changes', icon: FileStack },
      { to: '/changes/new', label: 'Create Change', icon: Plus },
    ]
  },
  {
    label: 'CMDB',
    items: [
      { to: '/cmdb', label: 'Configuration Items', icon: Database },
    ]
  },
  {
    label: 'Watson.ai',
    items: [
      { to: '/watson', label: 'AI Governance', icon: Cpu },
    ]
  }
];

export function LeftNav() {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (label) => setCollapsed(p => ({ ...p, [label]: !p[label] }));

  return (
    <nav style={{ width: 220, background: 'var(--sn-nav-bg)', position: 'fixed', top: 48, left: 0, bottom: 0, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.08)', zIndex: 900 }}>
      {sections.map(({ label, items }) => (
        <div key={label}>
          <button onClick={() => toggle(label)} style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}>
            {label}
            {collapsed[label] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          {!collapsed[label] && items.map(({ to, label: itemLabel, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 18px',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
              background: isActive ? 'rgba(0,179,136,0.25)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--sn-green)' : '3px solid transparent',
              fontSize: 13, fontWeight: isActive ? 600 : 400, textDecoration: 'none',
              transition: 'var(--transition)',
            })}>
              <Icon size={15} />
              {itemLabel}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
