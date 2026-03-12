import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileStack, Clock, CheckCircle2, AlertTriangle, ArrowRight, Plus, X } from 'lucide-react';
import { getChanges } from '../api/changes';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../context/AuthContext';

const PRIORITY_LABEL = { '1': '1 - Critical', '2': '2 - High', '3': '3 - Moderate', '4': '4 - Low' };
const PRIORITY_COLOR = { '1': '#c0392b', '2': '#d35400', '3': '#b45309', '4': '#27ae60' };

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderTop: `3px solid ${color}`, borderRadius: 4, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--sn-text-secondary)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--sn-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FilterInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '3px 22px 3px 6px', border: '1px solid #dde1e7', borderRadius: 2, fontSize: 11, fontFamily: 'inherit', outline: 'none', background: value ? '#f0f4ff' : '#fafbfc' }} />
      {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1 }}><X size={10} /></button>}
    </div>
  );
}

export default function DashboardPage() {
  const [changes, setChanges]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Per-column filter state
  const [filters, setFilters] = useState({ number: '', description: '', type: '', priority: '', status: '', requester: '' });
  const setFilter = (key, val) => setFilters(p => ({ ...p, [key]: val }));

  useEffect(() => {
    getChanges().then(r => setChanges(r.data.results || r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => changes.filter(c => {
    const f = filters;
    const requesterName = `${c.requester?.first_name || ''} ${c.requester?.last_name || ''}`.toLowerCase();
    return (
      (!f.number      || c.ticket_number.toLowerCase().includes(f.number.toLowerCase())) &&
      (!f.description || c.short_description.toLowerCase().includes(f.description.toLowerCase())) &&
      (!f.type        || c.change_type.toLowerCase().includes(f.type.toLowerCase())) &&
      (!f.priority    || (PRIORITY_LABEL[c.priority] || '').toLowerCase().includes(f.priority.toLowerCase())) &&
      (!f.status      || c.status.toLowerCase().includes(f.status.toLowerCase())) &&
      (!f.requester   || requesterName.includes(f.requester.toLowerCase()))
    );
  }), [changes, filters]);

  const stats = {
    total:   changes.length,
    active:  changes.filter(c => ['IMPLEMENT','SCHEDULED','AUTHORIZE'].includes(c.status)).length,
    pending: changes.filter(c => ['NEW','ASSESS'].includes(c.status)).length,
    closed:  changes.filter(c => c.status === 'CLOSED').length,
  };

  const anyFilter = Object.values(filters).some(Boolean);
  const hdr = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sn-text-secondary)', background: '#f5f6f8', borderBottom: '1px solid var(--sn-border)', whiteSpace: 'nowrap' };
  const cell = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--sn-border-light)' };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Change Management</h1>
          <p style={{ color: 'var(--sn-text-muted)', fontSize: 13 }}>Welcome back, {user?.first_name} {user?.last_name} · {user?.role}</p>
        </div>
        <button onClick={() => navigate('/changes/new')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--sn-green)', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={14} /> Create Change
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Changes"   value={stats.total}   color="#1565c0" />
        <StatCard label="Active"          value={stats.active}  sub="Authorize / Scheduled / Implement" color="#6c3483" />
        <StatCard label="Pending"         value={stats.pending} sub="New or Assess" color="#b45309" />
        <StatCard label="Closed"          value={stats.closed}  color="#27ae60" />
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sn-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Recent Changes</span>
            {anyFilter && (
              <span style={{ fontSize: 11, color: '#1565c0', background: '#e8f0fe', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                {filtered.length} of {changes.length} shown
              </span>
            )}
            {anyFilter && (
              <button onClick={() => setFilters({ number: '', description: '', type: '', priority: '', status: '', requester: '' })}
                style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
                <X size={11} /> Clear filters
              </button>
            )}
          </div>
          <button onClick={() => navigate('/changes')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--sn-blue)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            View all <ArrowRight size={13} />
          </button>
        </div>

        {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--sn-text-muted)' }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Number','Short Description','Type','Priority','State','Requested by','Updated'].map(h => <th key={h} style={hdr}>{h}</th>)}
              </tr>
              {/* Per-column filter row */}
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid var(--sn-border)' }}>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.number}      onChange={v => setFilter('number', v)}      placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.description} onChange={v => setFilter('description', v)} placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.type}        onChange={v => setFilter('type', v)}        placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.priority}    onChange={v => setFilter('priority', v)}    placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.status}      onChange={v => setFilter('status', v)}      placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }}><FilterInput value={filters.requester}   onChange={v => setFilter('requester', v)}   placeholder="Filter..." /></td>
                <td style={{ padding: '3px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--sn-text-muted)', fontSize: 13 }}>No changes match your filters</td></tr>
              ) : filtered.slice(0, 20).map(c => (
                <tr key={c.id} onClick={() => navigate(`/changes/${c.id}`)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <td style={{ ...cell, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--sn-blue)', whiteSpace: 'nowrap' }}>{c.ticket_number}</td>
                  <td style={{ ...cell, maxWidth: 280 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.short_description}</div></td>
                  <td style={{ ...cell, color: 'var(--sn-text-secondary)' }}>{c.change_type}</td>
                  <td style={{ ...cell }}>
                    {c.priority && <span style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_COLOR[c.priority] }}>{PRIORITY_LABEL[c.priority]}</span>}
                  </td>
                  <td style={cell}><StatusBadge status={c.status} small /></td>
                  <td style={{ ...cell, color: 'var(--sn-text-secondary)' }}>{c.requester?.first_name} {c.requester?.last_name}</td>
                  <td style={{ ...cell, color: 'var(--sn-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(c.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
