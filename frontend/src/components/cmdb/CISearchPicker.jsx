import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, AlertTriangle, List } from 'lucide-react';
import { searchCIs, getCIImpact } from '../../api/cmdb';
import { CITypeBadge, CIStatusDot } from './CITypeBadge';
import { CIBrowseModal } from './CIBrowseModal';

const DEPTH_LABELS = { '1': '1 level', '2': '2 levels', 'full': 'Full tree' };

export function CISearchPicker({ onAdd, existingIds = [], impactDepth = 'full' }) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState(null);
  const [impacted, setImpacted]   = useState([]);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [showBrowse, setShowBrowse]       = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 1) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchCIs(query)
        .then(r => { setResults(r.data); setShowDropdown(true); })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const fetchImpact = async (ci) => {
    setSelected(ci);
    setQuery('');
    setShowDropdown(false);
    setLoadingImpact(true);
    try {
      const res = await getCIImpact(ci.id, impactDepth);
      setImpacted(res.data.filter(imp => !existingIds.includes(imp.id)));
    } finally { setLoadingImpact(false); }
  };

  const handleConfirm = () => {
    if (!selected) return;
    onAdd(selected, impacted);
    setSelected(null);
    setImpacted([]);
  };

  const handleBrowseSelect = (ci) => { fetchImpact(ci); };

  const depthLabel = DEPTH_LABELS[impactDepth] || impactDepth;

  return (
    <div style={{ marginBottom: 12 }}>
      {showBrowse && (
        <CIBrowseModal
          existingIds={existingIds}
          onSelect={handleBrowseSelect}
          onClose={() => setShowBrowse(false)}
        />
      )}

      {/* Search row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid #c0c8d4', borderRadius: 3, background: '#fff' }}>
            <Search size={13} color="#9ca3af" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Type to search CI by name, ID, or IP..."
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, fontFamily: 'inherit' }} />
            {loading && <span style={{ width: 12, height: 12, border: '2px solid #c0c8d4', borderTopColor: '#1565c0', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />}
          </div>

          {/* Autocomplete dropdown */}
          {showDropdown && results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #c0c8d4', borderTop: 'none', borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
              {results.map(ci => (
                <div key={ci.id} onClick={() => fetchImpact(ci)}
                  style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <CITypeBadge type={ci.ci_type} small />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ci.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{ci.ci_id}{ci.ip_address ? ` · ${ci.ip_address}` : ''} · {ci.environment}</div>
                  </div>
                  <CIStatusDot status={ci.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Browse button */}
        <button onClick={() => setShowBrowse(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#f0f3f7', border: '1px solid #c0c8d4', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <List size={13} /> Browse
        </button>

        {/* Depth indicator */}
        <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          Impact: <span style={{ fontWeight: 600, color: '#6b7280' }}>{depthLabel}</span>
        </div>
      </div>

      {/* Selected CI + impact preview */}
      {selected && (
        <div style={{ marginTop: 10, border: '1px solid #c0c8d4', borderRadius: 3, overflow: 'hidden' }}>
          {/* Affected CI row */}
          <div style={{ padding: '8px 12px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', padding: '1px 6px', background: '#dbeafe', borderRadius: 3, flexShrink: 0 }}>AFFECTED</span>
            <CITypeBadge type={selected.ci_type} small />
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{selected.name}</span>
            <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{selected.ci_id}</span>
            <button onClick={() => { setSelected(null); setImpacted([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>

          {/* Impacted CIs */}
          {loadingImpact ? (
            <div style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, border: '2px solid #d1d5db', borderTopColor: '#1565c0', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              Calculating impact tree ({depthLabel})...
            </div>
          ) : impacted.length > 0 ? (
            <>
              <div style={{ padding: '6px 12px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} color="#d97706" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                  {impacted.length} Impacted CI{impacted.length !== 1 ? 's' : ''} found — {depthLabel} propagation
                </span>
              </div>
              {impacted.map(imp => (
                <div key={imp.id} style={{ padding: '6px 12px', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: 10, background: '#fffbf5' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', padding: '1px 6px', background: '#fef3c7', borderRadius: 3, flexShrink: 0 }}>IMPACTED</span>
                  <CITypeBadge type={imp.ci_type} small />
                  <span style={{ fontSize: 13, flex: 1 }}>{imp.name}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{imp.ci_id}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: imp.business_criticality === 'Critical' ? '#dc2626' : imp.business_criticality === 'High' ? '#d97706' : '#6b7280' }}>
                    {imp.business_criticality}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: '6px 12px', fontSize: 12, color: '#6b7280' }}>
              No downstream CIs found within {depthLabel}
            </div>
          )}

          <div style={{ padding: '8px 12px', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => { setSelected(null); setImpacted([]); }}
              style={{ padding: '4px 12px', background: '#fff', border: '1px solid #c0c8d4', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: '#6b7280' }}>
              Cancel
            </button>
            <button onClick={handleConfirm}
              style={{ padding: '4px 14px', background: '#1565c0', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={12} /> Add to Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
