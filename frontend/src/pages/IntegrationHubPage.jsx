import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import {
  Plug, Plus, Key, Trash2, RefreshCw, Copy, Check,
  AlertTriangle, ChevronDown, ChevronRight, Zap,
  Globe, Clock, BarChart2, Shield, Code, Webhook
} from 'lucide-react';

const SOURCE_LABELS = {
  servicenow: 'ServiceNow',
  jira:       'Jira SM',
  bmc:        'BMC Helix',
  custom:     'Custom',
};

const STATUS_CFG = {
  ACTIVE:   { color: '#16a34a', bg: '#f0fdf4', label: 'Active'   },
  INACTIVE: { color: '#9ca3af', bg: '#f9fafb', label: 'Inactive' },
  REVOKED:  { color: '#dc2626', bg: '#fef2f2', label: 'Revoked'  },
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} title="Copy"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}>
      {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
    </button>
  );
}

function AppCard({ app, onRefresh }) {
  const [expanded, setExpanded]   = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey]       = useState(null);
  const sc = STATUS_CFG[app.status] || STATUS_CFG.ACTIVE;

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const r = await api.post(`/integrations/apps/${app.id}/keys/`, { name: newKeyName });
      setNewKey(r.data);
      setNewKeyName('');
      onRefresh();
    } finally { setCreatingKey(false); }
  };

  const revokeKey = async (keyId) => {
    if (!window.confirm('Revoke this key? This cannot be undone.')) return;
    await api.delete(`/integrations/keys/${keyId}/`);
    onRefresh();
  };

  const revokeApp = async () => {
    if (!window.confirm(`Revoke ${app.name}? All its API keys will be disabled.`)) return;
    await api.delete(`/integrations/apps/${app.id}/`);
    onRefresh();
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff', cursor: 'pointer', userSelect: 'none' }}>
        {expanded ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}

        <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plug size={15} color="#7c3aed" />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{app.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {SOURCE_LABELS[app.source_system] || app.source_system}
            {app.last_called_at && ` · Last call ${new Date(app.last_called_at).toLocaleDateString()}`}
          </div>
        </div>

        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: sc.color, background: sc.bg }}>
          {sc.label}
        </span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{app.total_requests} requests</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{app.api_keys?.length || 0} active keys</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 16px', background: '#fafafa' }}>

          {/* New key shown once */}
          {newKey && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={12} /> Store this key now — it will not be shown again.
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#1e293b', color: '#7dd3fc', padding: '8px 12px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
                {newKey.key}
                <CopyButton text={newKey.key} />
              </div>
              <button onClick={() => setNewKey(null)} style={{ marginTop: 8, fontSize: 11, color: '#d97706', background: 'none', border: 'none', cursor: 'pointer' }}>
                I've saved it ✓
              </button>
            </div>
          )}

          {/* API keys */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Key size={11} /> API Keys
            </div>
            {app.api_keys?.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>No active keys. Create one below.</div>
            )}
            {app.api_keys?.map(key => (
              <div key={key.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                  {key.key_prefix}…
                </span>
                <span style={{ fontSize: 12, color: '#1e293b', flex: 1 }}>{key.name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{key.usage_count} uses</span>
                {key.last_used_at && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    Last used {new Date(key.last_used_at).toLocaleDateString()}
                  </span>
                )}
                <button onClick={() => revokeKey(key.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }} title="Revoke key">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {/* Create key */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createKey()}
                placeholder="Key name e.g. Production"
                style={{ flex: 1, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={createKey} disabled={creatingKey || !newKeyName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: '#7c3aed', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={11} /> Create key
              </button>
            </div>
          </div>

          {/* Webhook */}
          {app.webhook_url && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Webhook size={11} /> Webhook configured
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{app.webhook_url}</div>
            </div>
          )}

          {/* Revoke app */}
          {app.status === 'ACTIVE' && (
            <button onClick={revokeApp}
              style={{ fontSize: 11, color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Revoke this application
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UsagePanel({ usage }) {
  if (!usage) return null;
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Recent activity</div>
      {usage.recent_requests.slice(0, 20).map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: r.request_type === 'GENERATE' ? '#f0f9ff' : r.request_type === 'VALIDATE' ? '#f0fdf4' : '#fffbeb',
            color:      r.request_type === 'GENERATE' ? '#0369a1' : r.request_type === 'VALIDATE' ? '#15803d' : '#d97706',
          }}>
            {r.request_type}
          </span>
          <span style={{ color: '#475569', flex: 1 }}>{r.app}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed' }}>{r.source_change_id}</span>
          <span style={{ color: r.status === 'SUCCESS' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{r.status}</span>
          {r.duration_ms && <span style={{ color: '#94a3b8' }}>{r.duration_ms}ms</span>}
          <span style={{ color: '#94a3b8' }}>{new Date(r.created_at).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function SchemaPanel() {
  const [schema, setSchema] = useState(null);
  useEffect(() => {
    api.get('/v1/assurance/schema/').then(r => setSchema(r.data)).catch(() => {});
  }, []);

  if (!schema) return <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading schema…</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Protocol endpoints</div>
        {Object.entries(schema.endpoints).map(([endpoint, desc]) => (
          <div key={endpoint} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', minWidth: 300, flexShrink: 0 }}>{endpoint}</span>
            <span style={{ color: '#475569' }}>{desc}</span>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Required input fields</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {schema.input_schema.required_fields.map(f => (
            <span key={f} style={{ fontFamily: 'monospace', fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 4 }}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Enum values</div>
        {Object.entries(schema.input_schema.enums).map(([field, values]) => (
          <div key={field} style={{ marginBottom: 6, fontSize: 12 }}>
            <span style={{ fontFamily: 'monospace', color: '#7c3aed', marginRight: 8 }}>{field}</span>
            {values.map(v => (
              <span key={v} style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 3, marginRight: 4, fontSize: 11 }}>{v}</span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ background: '#1e293b', borderRadius: 6, padding: '12px 16px', fontSize: 11, color: '#7dd3fc', fontFamily: 'monospace', lineHeight: 1.7 }}>
        <div style={{ color: '#94a3b8', marginBottom: 6 }}># Example: generate a checklist from ServiceNow</div>
        <div>curl -X POST https://your-trails.com/api/v1/assurance/generate/ \</div>
        <div style={{ paddingLeft: 16 }}>-H "Authorization: Bearer trk_your_api_key" \</div>
        <div style={{ paddingLeft: 16 }}>-H "Content-Type: application/json" \</div>
        <div style={{ paddingLeft: 16 }}>-d '{`{"change_id":"CHG0012345","ticket_number":"CHG0012345","short_description":"OS patching on db-prod-01","change_type":"Normal","priority":"2","risk_level":"High","change_window_start":"2026-03-20T22:00:00Z","change_window_end":"2026-03-21T02:00:00Z","tasks":[{"id":1,"short_description":"Apply patches","sequence":1}],"cis":[{"name":"db-prod-01","ci_type":"Virtual Machine","environment":"Production","business_criticality":"Critical","role":"Affected"}]}`}'</div>
      </div>
    </div>
  );
}

export default function IntegrationHubPage() {
  const [apps, setApps]       = useState([]);
  const [usage, setUsage]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('apps');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]       = useState({ name: '', description: '', source_system: 'custom', webhook_url: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError]     = useState('');

  const loadApps = useCallback(async () => {
    try {
      const r = await api.get('/integrations/apps/');
      setApps(r.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const r = await api.get('/integrations/usage/');
      setUsage(r.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    Promise.all([loadApps(), loadUsage()]).finally(() => setLoading(false));
  }, [loadApps, loadUsage]);

  const createApp = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setCreating(true);
    setError('');
    try {
      await api.post('/integrations/apps/', form);
      setForm({ name: '', description: '', source_system: 'custom', webhook_url: '' });
      setShowCreate(false);
      loadApps();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create app');
    } finally { setCreating(false); }
  };

  const tabs = [
    { id: 'apps',   label: 'Connected Apps', icon: <Plug size={13} />     },
    { id: 'usage',  label: 'Usage',          icon: <BarChart2 size={13} /> },
    { id: 'schema', label: 'Schema & Docs',  icon: <Code size={13} />      },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'linear-gradient(135deg,#7c3aed,#1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plug size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Integration Hub</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Connect external systems to the T-Rails Change Assurance Protocol</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setShowCreate(true); setTab('apps'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={13} /> Connect app
        </button>
      </div>

      {/* Protocol summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: <Globe size={16} color="#7c3aed" />,  label: 'Step 1+2', desc: 'POST /generate — submit change, receive checklist' },
          { icon: <Shield size={16} color="#d97706" />, label: 'Step 3+4', desc: 'PATCH /accept — human review decisions' },
          { icon: <Zap size={16} color="#16a34a" />,    label: 'Step 5+6', desc: 'POST /validate — submit evidence, receive scores' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <div style={{ marginTop: 2, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #7c3aed' : '2px solid transparent', color: tab === t.id ? '#7c3aed' : '#64748b', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && tab === 'apps' && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>New connected application</div>
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Application name *</div>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. ServiceNow Production"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Source system</div>
              <select value={form.source_system} onChange={e => setForm(p => ({ ...p, source_system: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                <option value="servicenow">ServiceNow</option>
                <option value="jira">Jira Service Management</option>
                <option value="bmc">BMC Helix</option>
                <option value="custom">Custom / Other</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Description</div>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="e.g. Production ServiceNow instance for EMEA region"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Webhook URL (optional — results posted here)</div>
            <input value={form.webhook_url} onChange={e => setForm(p => ({ ...p, webhook_url: e.target.value }))}
              placeholder="https://your-system.com/webhooks/trails"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createApp} disabled={creating}
              style={{ padding: '6px 16px', background: '#7c3aed', border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {creating ? 'Creating…' : 'Create application'}
            </button>
            <button onClick={() => { setShowCreate(false); setError(''); }}
              style={{ padding: '6px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, color: '#475569', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {tab === 'apps' && (
            <div>
              {apps.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <Plug size={48} color="#e2e8f0" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>No connected applications</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 400, margin: '0 auto 16px' }}>
                    Connect ServiceNow, Jira, or any system that can call REST APIs.
                    Click "Connect app" to get started.
                  </div>
                </div>
              ) : (
                apps.map(app => <AppCard key={app.id} app={app} onRefresh={loadApps} />)
              )}
            </div>
          )}

          {tab === 'usage' && (
            <div>
              {/* Summary cards */}
              {usage && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
                  {usage.summary.map(s => (
                    <div key={s.app_id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.app_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{SOURCE_LABELS[s.source_system] || s.source_system}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>{s.total_requests}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>total requests</div>
                    </div>
                  ))}
                </div>
              )}
              <UsagePanel usage={usage} />
            </div>
          )}

          {tab === 'schema' && <SchemaPanel />}
        </>
      )}
    </div>
  );
}
