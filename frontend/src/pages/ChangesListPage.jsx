import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { getChanges } from '../api/changes';
import { StatusBadge } from '../components/common/StatusBadge';

export default function ChangesListPage() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getChanges().then(r => setChanges(r.data.results || r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = changes.filter(c => {
    const s = search.toLowerCase();
    return (!s || (c.short_description || '').toLowerCase().includes(s) || c.ticket_number.toLowerCase().includes(s))
      && (!statusFilter || c.status === statusFilter);
  });

  const statuses = ['NEW','ASSESS','AUTHORIZE','SCHEDULED','IMPLEMENT','REVIEW','CLOSED','CANCELLED'];
  const headerStyle = { padding: '7px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--sn-text-secondary)', background: '#f5f6f8', borderBottom: '2px solid var(--sn-border)', whiteSpace: 'nowrap' };
  const cellStyle = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--sn-border-light)' };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>All Changes</h1>
          <div style={{ fontSize: 12, color: 'var(--sn-text-muted)' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={() => navigate('/changes/new')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--sn-green)', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={14} /> New Change
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--sn-text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            style={{ width: '100%', padding: '6px 10px 6px 28px', border: '1px solid var(--sn-border)', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--sn-border)', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', cursor: 'pointer' }}>
          <option value="">All States</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--sn-text-muted)' }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Number','Short Description','Type','Priority','State','Category','Requested by','Updated'].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--sn-text-muted)' }}>No records found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} onClick={() => navigate(`/changes/${c.id}`)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <td style={{ ...cellStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--sn-blue)', whiteSpace: 'nowrap' }}>{c.ticket_number}</td>
                  <td style={{ ...cellStyle, maxWidth: 280 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.short_description}</div></td>
                  <td style={{ ...cellStyle, color: 'var(--sn-text-secondary)', whiteSpace: 'nowrap' }}>{c.change_type}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap', color: c.priority === '1' ? '#c0392b' : c.priority === '2' ? '#d35400' : 'var(--sn-text-primary)' }}>{c.priority ? `${c.priority} - ${['Critical','High','Moderate','Low'][parseInt(c.priority)-1]}` : '—'}</td>
                  <td style={cellStyle}><StatusBadge status={c.status} small /></td>
                  <td style={{ ...cellStyle, color: 'var(--sn-text-secondary)' }}>{c.category || '—'}</td>
                  <td style={{ ...cellStyle, color: 'var(--sn-text-secondary)', whiteSpace: 'nowrap' }}>{c.requester?.first_name} {c.requester?.last_name}</td>
                  <td style={{ ...cellStyle, color: 'var(--sn-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(c.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
