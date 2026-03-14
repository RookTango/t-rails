/**
 * CIInlinePicker — compact inline CI selector with search + browse modal.
 * Used on NewChangePage (change-level CI) and TaskDetailPage (task-level CI).
 *
 * Props:
 *   value       — currently selected CI object { id, ci_id, name, ci_type } or null
 *   onChange    — (ci | null) => void   called when selection changes
 *   placeholder — string
 *   disabled    — bool
 */
import { useState, useEffect, useRef } from 'react';
import { Search, X, List, ChevronRight, ChevronDown } from 'lucide-react';
import { searchCIs, getCIs } from '../../api/cmdb';
import { CITypeBadge } from './CITypeBadge';

// ── Browse modal ────────────────────────────────────────────────────────────
function BrowseModal({ onSelect, onClose }) {
  const [cis, setCIs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState('');
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    getCIs({ page_size: 200 }).then(r => {
      const list = r.data.results || r.data || [];
      setCIs(list);
      setFiltered(list);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!q.trim()) { setFiltered(cis); return; }
    const lq = q.toLowerCase();
    setFiltered(cis.filter(ci =>
      ci.name.toLowerCase().includes(lq) ||
      ci.ci_id.toLowerCase().includes(lq) ||
      (ci.ci_type || '').toLowerCase().includes(lq) ||
      (ci.environment || '').toLowerCase().includes(lq)
    ));
  }, [q, cis]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 6, width: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <List size={16} color="#7c3aed" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Browse Configuration Items</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
            <X size={16} />
          </button>
        </div>
        {/* Search */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 10px' }}>
            <Search size={13} color="#9ca3af" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter by name, CI ID, type, environment…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'inherit' }} />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>}
          </div>
        </div>
        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No CIs found</div>}
          {filtered.map(ci => (
            <div key={ci.id}
              onClick={() => { onSelect(ci); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 18px', cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <CITypeBadge type={ci.ci_type} small />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ci.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{ci.ci_id} · {ci.environment}</div>
              </div>
              <span style={{ fontSize: 11, color: ci.status === 'Operational' ? '#16a34a' : '#9ca3af',
                background: ci.status === 'Operational' ? '#f0fdf4' : '#f9fafb',
                padding: '1px 6px', borderRadius: 8, flexShrink: 0 }}>
                {ci.status}
              </span>
              {ci.business_criticality && (
                <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{ci.business_criticality}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#9ca3af' }}>
          {filtered.length} CI{filtered.length !== 1 ? 's' : ''} shown
        </div>
      </div>
    </div>
  );
}

// ── Main inline picker ──────────────────────────────────────────────────────
export function CIInlinePicker({ value, onChange, placeholder = 'Search CI…', disabled = false }) {
  const [q, setQ]             = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!q.trim() || q.length < 1) { setResults([]); setOpen(false); return; }
    const t = setTimeout(() => {
      searchCIs(q).then(r => {
        const list = r.data.results || r.data || [];
        setResults(list);
        setOpen(list.length > 0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const handleSelect = (ci) => {
    onChange(ci);
    setQ('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQ('');
  };

  // If a value is selected, show the selected CI chip
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
        border: '1px solid #c7d2fe', borderRadius: 4, background: '#f5f3ff' }}>
        <CITypeBadge type={value.ci_type} small />
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{value.name}</span>
        <span style={{ fontSize: 11, color: '#7c3aed', fontFamily: 'monospace' }}>{value.ci_id}</span>
        {!disabled && (
          <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1 }}>
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 4, background: disabled ? '#f9fafb' : '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', flex: 1 }}>
            <Search size={12} color="#9ca3af" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onFocus={() => q && results.length && setOpen(true)}
              disabled={disabled}
              placeholder={placeholder}
              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1,
                fontFamily: 'inherit', background: 'transparent', color: '#1e293b' }}
            />
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => setShowBrowse(true)}
              style={{ padding: '5px 10px', background: '#f8fafc', borderLeft: '1px solid #d1d5db',
                border: 'none', borderLeft: '1px solid #d1d5db', cursor: 'pointer',
                fontSize: 11, color: '#7c3aed', fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <List size={11} /> Browse
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
            background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none',
            borderRadius: '0 0 4px 4px', boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 220, overflowY: 'auto' }}>
            {results.map(ci => (
              <div key={ci.id}
                onMouseDown={() => handleSelect(ci)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <CITypeBadge type={ci.ci_type} small />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ci.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{ci.ci_id} · {ci.environment}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBrowse && <BrowseModal onSelect={handleSelect} onClose={() => setShowBrowse(false)} />}
    </>
  );
}
