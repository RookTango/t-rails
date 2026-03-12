import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LogOut, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getChanges } from '../../api/changes';
import { searchCIs } from '../../api/cmdb';

export function TopNav() {
  const { user, signOut: logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState({ changes: [], cis: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults({ changes: [], cis: [] }); setOpen(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [chRes, ciRes] = await Promise.all([
          getChanges({ q: query }),
          searchCIs(query),
        ]);
        const changes = (chRes.data.results || chRes.data).slice(0, 5);
        const cis     = (ciRes.data || []).slice(0, 5);
        setResults({ changes, cis });
        setOpen(true);
      } finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  const clear = () => { setQuery(''); setResults({ changes: [], cis: [] }); setOpen(false); };

  const goChange = (id) => { navigate(`/changes/${id}`); clear(); };
  const goCI     = (id) => { navigate(`/cmdb`); clear(); };

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`;
  const hasResults = results.changes.length > 0 || results.cis.length > 0;

  return (
    <header style={{ height: 48, background: '#1a2332', display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 14, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: 'linear-gradient(135deg,#00b388,#1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>T</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>T-Rails</span>
      </div>

      {/* Global search */}
      <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '5px 10px', transition: 'border-color 0.2s' }}
          onFocus={() => {}} >
          <Search size={14} color="rgba(255,255,255,0.5)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => hasResults && setOpen(true)}
            placeholder="Search changes, CIs, tickets..."
            style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 13, flex: 1, fontFamily: 'inherit' }}
          />
          {loading && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />}
          {query && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 0 }}><X size={13} /></button>}
        </div>

        {/* Dropdown */}
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 200, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            {!hasResults && !loading && (
              <div style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No results for "{query}"</div>
            )}

            {results.changes.length > 0 && (
              <>
                <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#9ca3af', background: '#f9fafb', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Change Requests</div>
                {results.changes.map(c => (
                  <div key={c.id} onClick={() => goChange(c.id)}
                    style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1565c0', fontWeight: 700, flexShrink: 0 }}>{c.ticket_number}</span>
                    <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.short_description}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{c.status}</span>
                  </div>
                ))}
              </>
            )}

            {results.cis.length > 0 && (
              <>
                <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#9ca3af', background: '#f9fafb', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Configuration Items</div>
                {results.cis.map(ci => (
                  <div key={ci.id} onClick={() => goCI(ci.id)}
                    style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7c3aed', fontWeight: 700, flexShrink: 0 }}>{ci.ci_id}</span>
                    <span style={{ fontSize: 13, flex: 1 }}>{ci.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{ci.ci_type}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#00b388', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{initials || <User size={14} />}</div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{user?.first_name} {user?.last_name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{user?.role}</div>
          </div>
        </div>
        <button onClick={logout} title="Sign out" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center' }}>
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
