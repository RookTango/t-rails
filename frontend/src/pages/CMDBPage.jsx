import { useState, useEffect } from 'react';
import { Plus, Search, Network, Pencil, Trash2, X, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { getCIs, createCI, updateCI, deleteCI, addRelationship, deleteRelationship } from '../api/cmdb';
import { CITypeBadge, CIStatusDot, CriticalityBadge } from '../components/cmdb/CITypeBadge';

const CI_TYPES = ['ESXi Host','Virtual Machine','Physical Server','Application','Database','Middleware','Container/Pod','Network Device','Storage','Other'];
const ENVS = ['Production','Staging','UAT','Development','DR'];
const CRITICALITIES = ['Critical','High','Medium','Low'];
const STATUSES = ['Operational','Maintenance','Decommissioned','Planned'];
const REL_TYPES = [['hosts','Hosts'],['contains','Contains'],['runs_on','Runs On'],['depends_on','Depends On'],['connects_to','Connects To'],['backed_by','Backed By']];

const inputStyle = { padding: '5px 8px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%' };

function CIDetail({ ci, allCIs, onRefresh, onClose }) {
  const [addRel, setAddRel] = useState({ target: '', type: 'hosts' });
  const [saving, setSaving] = useState(false);

  const handleAddRel = async () => {
    if (!addRel.target) return;
    setSaving(true);
    try { await addRelationship({ source_ci: ci.id, target_ci: parseInt(addRel.target), relationship_type: addRel.type }); onRefresh(); setAddRel({ target: '', type: 'hosts' }); }
    catch (e) { alert(e.response?.data?.non_field_errors?.[0] || 'Error'); }
    finally { setSaving(false); }
  };

  const handleDeleteRel = async (id) => { await deleteRelationship(id); onRefresh(); };

  const others = allCIs.filter(c => c.id !== ci.id);

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 500, bottom: 0, background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', zIndex: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', background: '#f0f3f7', borderBottom: '1px solid var(--sn-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, fontFamily: 'JetBrains Mono, monospace' }}>{ci.ci_id}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{ci.name}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        {/* Properties */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Properties</div>
          {[
            ['Type', <CITypeBadge type={ci.ci_type} />],
            ['Status', <CIStatusDot status={ci.status} />],
            ['Environment', ci.environment],
            ['Criticality', <CriticalityBadge level={ci.business_criticality} />],
            ['IP Address', ci.ip_address || '—'],
            ['FQDN', ci.fqdn || '—'],
            ['OS', ci.os ? `${ci.os} ${ci.os_version || ''}`.trim() : '—'],
            ['CPU / RAM', ci.cpu_cores ? `${ci.cpu_cores} cores / ${ci.ram_gb} GB RAM` : '—'],
            ['Department', ci.department || '—'],
            ['Support Group', ci.support_group || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Relationships */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={13} /> Relationships
          </div>

          {/* Outgoing */}
          {ci.outgoing_relationships?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>This CI →</div>
              {ci.outgoing_relationships.map(rel => (
                <div key={rel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#eff6ff', borderRadius: 3, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{rel.relationship_type}</span>
                  <span style={{ flex: 1 }}>{rel.target_ci_detail?.name}</span>
                  <CITypeBadge type={rel.target_ci_detail?.ci_type} small />
                  <button onClick={() => handleDeleteRel(rel.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Incoming */}
          {ci.incoming_relationships?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>← Depends on this CI</div>
              {ci.incoming_relationships.map(rel => (
                <div key={rel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#fffbeb', borderRadius: 3, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#92400e' }}>{rel.relationship_type}</span>
                  <span style={{ flex: 1 }}>{rel.source_ci_detail?.name}</span>
                  <CITypeBadge type={rel.source_ci_detail?.ci_type} small />
                </div>
              ))}
            </div>
          )}

          {/* Add relationship */}
          <div style={{ padding: 10, background: '#f9fafb', border: '1px solid var(--sn-border)', borderRadius: 3 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Add Relationship</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <select value={addRel.type} onChange={e => setAddRel(p => ({...p, type: e.target.value}))} style={{ ...inputStyle, height: 28 }}>
                {REL_TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={addRel.target} onChange={e => setAddRel(p => ({...p, target: e.target.value}))} style={{ ...inputStyle, height: 28 }}>
                <option value="">Select target CI</option>
                {others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={handleAddRel} disabled={saving || !addRel.target}
              style={{ padding: '4px 12px', background: '#1565c0', border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CMDBPage() {
  const [cis, setCIs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [selectedCI, setSelectedCI] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', ci_type: 'Virtual Machine', environment: 'Production', status: 'Operational', business_criticality: 'Medium', ip_address: '', fqdn: '', os: '', department: '', support_group: '' });

  const load = () => {
    setLoading(true);
    getCIs({ q: search, type: typeFilter, env: envFilter }).then(r => {
      setCIs(r.data.results || r.data);
      // Re-select to refresh detail panel
      if (selectedCI) {
        const updated = (r.data.results || r.data).find(c => c.id === selectedCI.id);
        if (updated) setSelectedCI(null); // Force re-fetch via detail click
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, typeFilter, envFilter]);

  const handleCreate = async () => {
    if (!newForm.name.trim()) return;
    setCreating(true);
    try { await createCI(newForm); setShowCreate(false); setNewForm({ name: '', ci_type: 'Virtual Machine', environment: 'Production', status: 'Operational', business_criticality: 'Medium', ip_address: '', fqdn: '', os: '', department: '', support_group: '' }); load(); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this CI?')) return;
    await deleteCI(id);
    if (selectedCI?.id === id) setSelectedCI(null);
    load();
  };

  const handleRowClick = async (ci) => {
    const { getCI } = await import('../api/cmdb');
    const res = await getCI(ci.id);
    setSelectedCI(res.data);
  };

  const hdr = { padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f5f6f8', borderBottom: '2px solid var(--sn-border)', textAlign: 'left', whiteSpace: 'nowrap' };
  const cell = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid var(--sn-border-light)' };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      {selectedCI && <div onClick={() => setSelectedCI(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 199 }} />}
      {selectedCI && <CIDetail ci={selectedCI} allCIs={cis} onRefresh={() => handleRowClick(selectedCI)} onClose={() => setSelectedCI(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Configuration Items</h1>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{cis.length} CIs in CMDB</div>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#00b388', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={14} /> New CI
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 16, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Configuration Item</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            {[['name','Name *','text'],['ip_address','IP Address','text'],['fqdn','FQDN','text'],['os','OS','text'],['department','Department','text'],['support_group','Support Group','text']].map(([f,l]) => (
              <div key={f}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{l}</div>
                <input value={newForm[f] || ''} onChange={e => setNewForm(p => ({...p, [f]: e.target.value}))} style={{ ...inputStyle, height: 28 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
            {[['ci_type','Type',CI_TYPES],['environment','Environment',ENVS],['status','Status',STATUSES],['business_criticality','Criticality',CRITICALITIES]].map(([f,l,opts]) => (
              <div key={f}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{l}</div>
                <select value={newForm[f]} onChange={e => setNewForm(p => ({...p, [f]: e.target.value}))} style={{ ...inputStyle, height: 28, cursor: 'pointer' }}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating} style={{ padding: '5px 16px', background: '#1565c0', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{creating ? 'Creating...' : 'Create CI'}</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '5px 14px', background: '#fff', border: '1px solid #c0c8d4', borderRadius: 3, color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, CI ID, or IP..."
            style={{ ...inputStyle, paddingLeft: 28, height: 32 }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', height: 32, cursor: 'pointer' }}>
          <option value="">All Types</option>
          {CI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={envFilter} onChange={e => setEnvFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', height: 32, cursor: 'pointer' }}>
          <option value="">All Environments</option>
          {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['CI ID','Name','Type','Status','Environment','Criticality','IP Address','Department','Relationships',''].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {cis.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>No CIs found</td></tr>
              ) : cis.map(ci => (
                <tr key={ci.id} onClick={() => handleRowClick(ci)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <td style={{ ...cell, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#1565c0', whiteSpace: 'nowrap' }}>{ci.ci_id}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{ci.name}</td>
                  <td style={cell}><CITypeBadge type={ci.ci_type} small /></td>
                  <td style={cell}><CIStatusDot status={ci.status} /></td>
                  <td style={{ ...cell, color: '#6b7280', fontSize: 12 }}>{ci.environment}</td>
                  <td style={cell}><CriticalityBadge level={ci.business_criticality} /></td>
                  <td style={{ ...cell, color: '#6b7280', fontSize: 12, fontFamily: 'monospace' }}>{ci.ip_address || '—'}</td>
                  <td style={{ ...cell, color: '#6b7280', fontSize: 12 }}>{ci.department || '—'}</td>
                  <td style={{ ...cell, fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                      <GitBranch size={12} /> Click to view
                    </span>
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => handleDelete(ci.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
