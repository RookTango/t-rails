import { useState, useEffect } from 'react';
import { Trash2, Network, RefreshCw, Settings2 } from 'lucide-react';
import { getChangeCIs, addChangeCI, removeChangeCI, updateChange } from '../../api/changes';
import { CITypeBadge, CIStatusDot, CriticalityBadge } from './CITypeBadge';
import { CISearchPicker } from './CISearchPicker';

const DEPTH_OPTIONS = [
  { value: '1',    label: '1 Level',    desc: 'Direct relationships only' },
  { value: '2',    label: '2 Levels',   desc: 'Children of children' },
  { value: 'full', label: 'Full Tree',  desc: 'All descendants (default)' },
];

const ROLE_CFG = {
  Affected: { color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  Impacted: { color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
};

export function ChangeCITab({ change, onRefresh: onChangeRefresh }) {
  const [cis, setCIs]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [depth, setDepth]     = useState(change.ci_impact_depth || 'full');
  const [savingDepth, setSavingDepth] = useState(false);

  const load = () => {
    setLoading(true);
    getChangeCIs(change.id).then(r => setCIs(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [change.id]);

  const existingCIIds = cis.map(c => c.ci_detail?.id).filter(Boolean);

  const handleDepthChange = async (newDepth) => {
    setDepth(newDepth);
    setSavingDepth(true);
    try {
      await updateChange(change.id, { ci_impact_depth: newDepth });
      if (onChangeRefresh) onChangeRefresh();
    } finally { setSavingDepth(false); }
  };

  const handleAdd = async (affected, impactedList) => {
    await addChangeCI(change.id, { ci_id: affected.id, role: 'Affected' });
    load();
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this CI from the change?')) return;
    setRemoving(id);
    await removeChangeCI(id);
    load();
    setRemoving(null);
  };

  const affected = cis.filter(c => c.role === 'Affected');
  const impacted = cis.filter(c => c.role === 'Impacted');

  const hdr = { padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f5f6f8', borderBottom: '2px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' };
  const cell = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' };

  const CIRow = ({ cci }) => {
    const ci = cci.ci_detail;
    const rc = ROLE_CFG[cci.role];
    return (
      <tr style={{ background: '#fff' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
        <td style={cell}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>{cci.role}</span>
        </td>
        <td style={{ ...cell, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#1565c0' }}>{ci?.ci_id}</td>
        <td style={{ ...cell, fontWeight: 600 }}>{ci?.name}</td>
        <td style={cell}><CITypeBadge type={ci?.ci_type} small /></td>
        <td style={cell}><CIStatusDot status={ci?.status} /></td>
        <td style={{ ...cell, fontSize: 12, color: '#6b7280' }}>{ci?.environment}</td>
        <td style={cell}><CriticalityBadge level={ci?.business_criticality} /></td>
        <td style={{ ...cell, fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{ci?.ip_address || '—'}</td>
        <td style={cell}>
          {cci.role === 'Affected' && (
            <button onClick={() => handleRemove(cci.id)} disabled={removing === cci.id}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}>
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Impact depth selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: '#f8f9fb', border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings2 size={14} color="#6b7280" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Impact Propagation Depth</span>
          {savingDepth && <span style={{ fontSize: 11, color: '#9ca3af' }}>Saving...</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DEPTH_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleDepthChange(opt.value)}
              title={opt.desc}
              style={{ padding: '4px 12px', borderRadius: 3, border: `1px solid ${depth === opt.value ? '#1565c0' : '#d1d5db'}`, background: depth === opt.value ? '#1565c0' : '#fff', color: depth === opt.value ? '#fff' : '#374151', fontSize: 12, fontWeight: depth === opt.value ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>
          {DEPTH_OPTIONS.find(o => o.value === depth)?.desc} — applies when adding new Affected CIs
        </div>
      </div>

      {/* Search + browse */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Add Configuration Item</div>
        <CISearchPicker
          onAdd={handleAdd}
          existingIds={existingCIIds}
          impactDepth={depth}
        />
      </div>

      {/* Summary */}
      {cis.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#1d4ed8' }}>{affected.length}</span>
            <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>Affected CI{affected.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#92400e' }}>{impacted.length}</span>
            <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Impacted CI{impacted.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', fontSize: 12, color: '#6b7280', fontFamily: 'inherit' }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      )}

      {/* CI table */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading...</div>
      ) : cis.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          <Network size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
          No CIs attached yet. Use search or browse above.
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Role','CI ID','Name','Type','Status','Environment','Criticality','IP Address',''].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {affected.map(cci => <CIRow key={cci.id} cci={cci} />)}
              {impacted.length > 0 && (
                <tr><td colSpan={9} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Auto-derived Impacted CIs</td></tr>
              )}
              {impacted.map(cci => <CIRow key={cci.id} cci={cci} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
