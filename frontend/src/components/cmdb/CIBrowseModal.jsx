import { useState, useEffect } from 'react';
import { X, Search, Check, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCIs } from '../../api/cmdb';
import { CITypeBadge, CIStatusDot, CriticalityBadge } from './CITypeBadge';

const CI_TYPES = ['','ESXi Host','Virtual Machine','Physical Server','Application','Database','Middleware','Container/Pod','Network Device','Storage','Other'];
const ENVS = ['','Production','Staging','UAT','Development','DR'];
const CRITS = ['','Critical','High','Medium','Low'];

const PAGE_SIZE = 12;

export function CIBrowseModal({ onSelect, onClose, existingIds = [] }) {
  const [cis, setCIs]         = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [filters, setFilters] = useState({ q: '', type: '', env: '', criticality: '' });
  const [staged, setStaged]   = useState(null); // single CI staged for confirmation

  const load = (f = filters, p = page) => {
    setLoading(true);
    getCIs({ q: f.q, type: f.type, env: f.env, criticality: f.criticality, page: p, page_size: PAGE_SIZE })
      .then(r => {
        const data = r.data;
        // Handle both paginated and flat responses
        if (data.results) { setCIs(data.results); setTotal(data.count); }
        else              { setCIs(data); setTotal(data.length); }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setFilter = (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next);
    setPage(1);
    load(next, 1);
  };

  const handlePageChange = (p) => { setPage(p); load(filters, p); };

  const handleConfirm = () => {
    if (staged) { onSelect(staged); onClose(); }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const hdr = { padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f5f6f8', borderBottom: '1px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' };
  const cell = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300 }} />

      {/* Modal */}
      <div style={{ position: 'fixed', top: '5%', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 900, maxHeight: '88vh', background: '#fff', borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', zIndex: 301, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Browse Configuration Items</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>Select a CI to add to this change</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff', padding: 6, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '10px 16px', background: '#f8f9fb', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={filters.q} onChange={e => setFilter('q', e.target.value)}
              placeholder="Search name, CI ID, IP..."
              style={{ width: '100%', padding: '6px 10px 6px 28px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#1565c0'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'} />
          </div>
          {[['type', 'All Types', CI_TYPES], ['env', 'All Envs', ENVS], ['criticality', 'All Criticality', CRITS]].map(([key, placeholder, opts]) => (
            <select key={key} value={filters[key]} onChange={e => setFilter(key, e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 130 }}>
              <option value="">{placeholder}</option>
              {opts.filter(o => o).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
            <Filter size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {total} result{total !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading...</div>
          ) : cis.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No CIs match your filters</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>{['','CI ID','Name','Type','Status','Environment','Criticality','IP / FQDN','Department'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {cis.map(ci => {
                  const isExisting = existingIds.includes(ci.id);
                  const isStaged   = staged?.id === ci.id;
                  return (
                    <tr key={ci.id}
                      onClick={() => !isExisting && setStaged(isStaged ? null : ci)}
                      style={{ cursor: isExisting ? 'not-allowed' : 'pointer', opacity: isExisting ? 0.45 : 1, background: isStaged ? '#eff6ff' : '#fff', outline: isStaged ? '2px solid #1565c0' : 'none', outlineOffset: -2 }}
                      onMouseEnter={e => { if (!isExisting && !isStaged) e.currentTarget.style.background = '#f9fafb'; }}
                      onMouseLeave={e => { if (!isStaged) e.currentTarget.style.background = '#fff'; }}>
                      <td style={{ ...cell, width: 36, textAlign: 'center' }}>
                        {isExisting ? (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>Added</span>
                        ) : isStaged ? (
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1565c0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <Check size={11} color="#fff" />
                          </div>
                        ) : (
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #d1d5db', margin: '0 auto' }} />
                        )}
                      </td>
                      <td style={{ ...cell, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#1565c0', whiteSpace: 'nowrap' }}>{ci.ci_id}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{ci.name}</td>
                      <td style={cell}><CITypeBadge type={ci.ci_type} small /></td>
                      <td style={cell}><CIStatusDot status={ci.status} /></td>
                      <td style={{ ...cell, fontSize: 12, color: '#6b7280' }}>{ci.environment}</td>
                      <td style={cell}><CriticalityBadge level={ci.business_criticality} /></td>
                      <td style={{ ...cell, fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{ci.ip_address || ci.fqdn || '—'}</td>
                      <td style={{ ...cell, fontSize: 12, color: '#6b7280' }}>{ci.department || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer — pagination + confirm */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f8f9fb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
              style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 3, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Page {page} of {totalPages || 1}</span>
            <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
              style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 3, background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Selected + confirm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {staged ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 3 }}>
                <CITypeBadge type={staged.ci_type} small />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{staged.name}</span>
                <button onClick={() => setStaged(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Click a row to select</span>
            )}
            <button onClick={onClose} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>Cancel</button>
            <button onClick={handleConfirm} disabled={!staged}
              style={{ padding: '6px 16px', background: staged ? '#1565c0' : '#93c5fd', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: staged ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Add Selected CI
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
