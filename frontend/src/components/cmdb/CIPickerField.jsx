/**
 * CIPickerField — inline search + browse modal for picking a single CI.
 * Used on NewChangePage (configuration_item) and wherever a single CI ref is needed.
 *
 * Props:
 *   value        — current CI object { id, ci_id, name, ci_type, environment } or null
 *   onChange     — called with CI object when selected, or null when cleared
 *   placeholder  — input placeholder text
 *   disabled     — read-only mode
 */
import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, Network, ExternalLink } from 'lucide-react';
import { searchCIs, getCIs } from '../../api/cmdb';
import { CITypeBadge } from './CITypeBadge';

// ── Inline search dropdown ─────────────────────────────────────────────────
function CISearchDropdown({ query, onSelect, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchCIs(query)
        .then(r => setResults(Array.isArray(r.data) ? r.data : r.data?.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  if (!query) return null;

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
      background: '#fff', border: '1px solid #c0c8d4', borderTop: 'none',
      borderRadius: '0 0 4px 4px', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      maxHeight: 260, overflowY: 'auto',
    }}>
      {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>Searching…</div>}
      {!loading && results.length === 0 && query.length > 0 && (
        <div style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>No CIs found for "{query}"</div>
      )}
      {results.map(ci => (
        <div key={ci.id}
          onMouseDown={e => { e.preventDefault(); onSelect(ci); }}
          style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f3f4f6' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
          <CITypeBadge type={ci.ci_type} small />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{ci.name}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{ci.ci_id} · {ci.environment} · {ci.status}</div>
          </div>
          <span style={{ fontSize: 10, color: ci.business_criticality === 'High' ? '#dc2626' : '#9ca3af', flexShrink: 0 }}>
            {ci.business_criticality}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Browse modal ───────────────────────────────────────────────────────────
function CIBrowseModal({ onSelect, onClose }) {
  const [items, setItems]   = useState([]);
  const [query, setQuery]   = useState('');
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [envFilter, setEnvFilter]   = useState('');

  const load = (q, type, env) => {
    setLoading(true);
    const params = {};
    if (q)    params.search = q;
    if (type) params.ci_type = type;
    if (env)  params.environment = env;
    getCIs(params)
      .then(r => setItems(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(query, typeFilter, envFilter); }, [query, typeFilter, envFilter]);

  const CI_TYPES = ['Server', 'Database', 'Network Device', 'Application', 'Storage', 'Virtual Machine', 'Container', 'Service'];
  const ENVS     = ['Production', 'Staging', 'Development', 'DR', 'Test'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 6, width: 720, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Network size={16} color="#7c3aed" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Browse Configuration Items</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative', display: 'flex', alignItems: 'center', border: '1px solid #c0c8d4', borderRadius: 3, padding: '5px 10px', gap: 6 }}>
            <Search size={13} color="#9ca3af" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search name or CI ID…"
              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'inherit' }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>}
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', color: '#374151', outline: 'none', background: '#fff' }}>
            <option value="">All Types</option>
            {CI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', color: '#374151', outline: 'none', background: '#fff' }}>
            <option value="">All Environments</option>
            {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {!loading && items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No CIs found</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr>
                {['CI ID', 'Name', 'Type', 'Environment', 'Status', 'Criticality', ''].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(ci => (
                <tr key={ci.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { onSelect(ci); onClose(); }}>
                  <td style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'monospace', color: '#7c3aed' }}>{ci.ci_id}</td>
                  <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>{ci.name}</td>
                  <td style={{ padding: '8px 14px' }}><CITypeBadge type={ci.ci_type} small /></td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#6b7280' }}>{ci.environment}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                      color: ci.status === 'Operational' ? '#16a34a' : '#6b7280',
                      background: ci.status === 'Operational' ? '#f0fdf4' : '#f9fafb' }}>
                      {ci.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 11, color: ci.business_criticality === 'High' ? '#dc2626' : '#6b7280' }}>
                    {ci.business_criticality}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <button style={{ padding: '3px 10px', background: '#1565c0', border: 'none', borderRadius: 3, color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#9ca3af' }}>
          {items.length} CI{items.length !== 1 ? 's' : ''} shown · Click a row to select
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export function CIPickerField({ value, onChange, placeholder = 'Search CI…', disabled = false }) {
  const [query, setQuery]       = useState('');
  const [focused, setFocused]   = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const inputRef = useRef(null);

  const handleSelect = (ci) => {
    onChange(ci);
    setQuery('');
    setFocused(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        {/* Selected value display / search input */}
        {value && !focused ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
            border: '1px solid #c0c8d4', borderRadius: 3, background: disabled ? '#f8f9fb' : '#fff',
            cursor: disabled ? 'default' : 'pointer',
          }} onClick={() => { if (!disabled) { setFocused(true); setTimeout(() => inputRef.current?.focus(), 50); } }}>
            <CITypeBadge type={value.ci_type} small />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{value.ci_id} · {value.environment}</div>
            </div>
            {!disabled && (
              <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 0, border: '1px solid #c0c8d4', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '5px 8px', gap: 6, background: '#fff' }}>
              <Search size={13} color="#9ca3af" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
                disabled={disabled}
                placeholder={placeholder}
                style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'inherit', background: 'transparent' }}
              />
            </div>
            {!disabled && (
              <button
                onMouseDown={e => { e.preventDefault(); setShowBrowse(true); }}
                style={{ padding: '5px 10px', background: '#f0f3f7', border: 'none', borderLeft: '1px solid #c0c8d4', cursor: 'pointer', color: '#374151', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Network size={12} /> Browse
              </button>
            )}
          </div>
        )}

        {focused && query.length > 0 && (
          <CISearchDropdown query={query} onSelect={handleSelect} onClose={() => setFocused(false)} />
        )}
      </div>

      {showBrowse && <CIBrowseModal onSelect={handleSelect} onClose={() => setShowBrowse(false)} />}
    </>
  );
}
