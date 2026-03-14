import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, X, Network, AlertCircle } from 'lucide-react';
import { getTask, updateTask, transitionTask, addTaskCI, removeTaskCI } from '../api/changes';
import { CIPickerField } from '../components/cmdb/CIPickerField';
import { CITypeBadge } from '../components/cmdb/CITypeBadge';
import { TextInput, SelectInput, TextArea, DateTimeInput } from '../components/common/FormField';
import { useAuth } from '../context/AuthContext';

const TASK_PHASES = ['Open', 'In Progress', 'Completed'];
const TASK_STATUS_CFG = {
  'Open':        { color: '#1565c0', bg: '#eff6ff' },
  'In Progress': { color: '#d97706', bg: '#fff7ed' },
  'Completed':   { color: '#16a34a', bg: '#f0fdf4' },
  'Skipped':     { color: '#6b7280', bg: '#f9fafb' },
  'Cancelled':   { color: '#dc2626', bg: '#fef2f2' },
};
const TASK_TRANSITIONS = {
  'Open':        ['In Progress', 'Skipped', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  'Completed':   [],
  'Skipped':     ['Open'],
  'Cancelled':   ['Open'],
};
const STATUS_BTN_COLOR = {
  'In Progress': '#d97706', 'Completed': '#16a34a',
  'Cancelled':   '#dc2626', 'Skipped':   '#6b7280', 'Open': '#1565c0',
};

function TaskPipeline({ status }) {
  const currentIdx = TASK_PHASES.indexOf(status);
  return (
    <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid var(--sn-border)', overflowX: 'auto' }}>
      {TASK_PHASES.map((phase, idx) => {
        const isDone   = idx < currentIdx || status === 'Completed';
        const isActive = phase === status || (status === 'Completed' && idx === 2);
        const isFirst  = idx === 0;
        const isLast   = idx === TASK_PHASES.length - 1;
        let bg = '#f0f2f4', color = '#6b7280', fw = 400;
        if (isActive) { bg = TASK_STATUS_CFG[status]?.color || '#1565c0'; color = '#fff'; fw = 700; }
        else if (isDone) { bg = '#dcfce7'; color = '#16a34a'; fw = 500; }
        const clip = isFirst
          ? 'polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%)'
          : isLast
          ? 'polygon(0 0,100% 0,100% 100%,0 100%,12px 50%)'
          : 'polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%,12px 50%)';
        return (
          <div key={phase} style={{ flex: 1, position: 'relative', zIndex: TASK_PHASES.length - idx }}>
            <div style={{ height: 36, background: bg, color, fontWeight: fw, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              clipPath: clip, marginLeft: idx > 0 ? -6 : 0,
              paddingLeft: idx > 0 ? 18 : 10, paddingRight: isLast ? 10 : 18 }}>
              {phase}
            </div>
          </div>
        );
      })}
      {(status === 'Skipped' || status === 'Cancelled') && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0,
          background: TASK_STATUS_CFG[status]?.bg, color: TASK_STATUS_CFG[status]?.color,
          fontSize: 12, fontWeight: 700, gap: 5, borderLeft: '1px solid var(--sn-border)' }}>
          {status === 'Cancelled' ? '✕' : '⊘'} {status}
        </div>
      )}
    </div>
  );
}

export default function TaskDetailPage() {
  const { changeId, taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({});
  const [dirty, setDirty]         = useState(false);
  const [error, setError]         = useState('');
  const [transitioning, setTransitioning] = useState(false);

  // CI picker state for adding new CIs
  const [pendingCI, setPendingCI] = useState(null);
  const [addingCI,  setAddingCI]  = useState(false);

  const load = useCallback(() => {
    return getTask(taskId).then(r => {
      setTask(r.data);
      setForm(r.data);
      setDirty(false);
    }).finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const setField = (f, v) => { setForm(p => ({ ...p, [f]: v })); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTask(taskId, {
        short_description: form.short_description,
        description:       form.description,
        assignment_group:  form.assignment_group,
        planned_start:     form.planned_start,
        planned_end:       form.planned_end,
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleTransition = async (newStatus) => {
    setError('');
    if (!window.confirm(`Move task to "${newStatus}"?`)) return;
    setTransitioning(true);
    try {
      await transitionTask(taskId, newStatus);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Transition failed');
    } finally { setTransitioning(false); }
  };

  const handleAddCI = async () => {
    if (!pendingCI) return;
    setAddingCI(true);
    setError('');
    try {
      await addTaskCI(taskId, { ci_id: pendingCI.id });
      setPendingCI(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add CI');
    } finally { setAddingCI(false); }
  };

  const handleRemoveCI = async (tciId) => {
    setError('');
    try {
      await removeTaskCI(taskId, tciId);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove CI');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--sn-text-muted)', fontSize: 13 }}>Loading task…</div>;
  if (!task)   return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Task not found.</div>;

  const transitions = TASK_TRANSITIONS[task.status] || [];
  const cfg = TASK_STATUS_CFG[task.status] || {};
  const dt  = v => v ? new Date(v).toLocaleString() : '—';
  const btnBase = { padding: '4px 12px', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 };

  return (
    <div style={{ animation: 'fadeIn .2s ease', paddingBottom: 40 }}>
      {/* Breadcrumb / toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/changes/${changeId}`)}
          style={{ ...btnBase, background: '#f0f3f7', color: '#374151', border: '1px solid var(--sn-border)', padding: '3px 8px', fontSize: 12 }}>
          <ChevronLeft size={13} /> Change
        </button>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--sn-blue)' }}>{task.task_number}</span>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: cfg.bg, color: cfg.color }}>{task.status}</span>
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={handleSave} disabled={saving}
            style={{ ...btnBase, background: '#16a34a', color: '#fff' }}>
            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {transitions.map(ts => (
          <button key={ts} onClick={() => handleTransition(ts)} disabled={transitioning}
            style={{ ...btnBase, background: STATUS_BTN_COLOR[ts] || '#1565c0', color: '#fff' }}>
            → {ts}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 14px', margin: '8px 0', display: 'flex', gap: 8, color: '#dc2626', fontSize: 13, alignItems: 'flex-start' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>{error}</div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      {/* Pipeline */}
      <TaskPipeline status={task.status} />

      {/* Form grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '10px 0', background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 14 }}>
        {/* Left */}
        <div>
          <div style={{ background: '#e8ecf0', padding: '4px 10px', borderLeft: '3px solid #1565c0', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Task Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '5px 10px', alignItems: 'center' }}>
            {[
              ['Task Number', <TextInput value={task.task_number} disabled style={{ fontFamily: 'monospace', fontSize: 12 }} />],
              ['Assignment Group', <TextInput value={form.assignment_group || ''} onChange={e => setField('assignment_group', e.target.value)} />],
              ['Planned Start', <DateTimeInput value={form.planned_start} onChange={v => setField('planned_start', v)} />],
              ['Planned End',   <DateTimeInput value={form.planned_end}   onChange={v => setField('planned_end', v)} />],
              ['Actual Start',  <TextInput value={dt(task.actual_start)} disabled style={{ fontFamily: 'monospace', fontSize: 12, color: task.actual_start ? '#16a34a' : '#9ca3af' }} />],
              ['Actual End',    <TextInput value={dt(task.actual_end)}   disabled style={{ fontFamily: 'monospace', fontSize: 12, color: task.actual_end ? '#16a34a' : '#9ca3af' }} />],
            ].map(([label, field]) => (
              <>
                <span key={label + '-lbl'} style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                <div key={label + '-fld'}>{field}</div>
              </>
            ))}
          </div>
        </div>
        {/* Right */}
        <div>
          <div style={{ background: '#e8ecf0', padding: '4px 10px', borderLeft: '3px solid #1565c0', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Description</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Short Description *</div>
          <TextInput value={form.short_description || ''} onChange={e => setField('short_description', e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Work Notes</div>
          <TextArea value={form.description || ''} onChange={e => setField('description', e.target.value)} rows={6} placeholder="Step-by-step notes, observations…" />
        </div>
      </div>

      {/* CI Section */}
      <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, marginBottom: 10 }}>
        <div style={{ background: '#f0f3f7', borderBottom: '1px solid var(--sn-border)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: '4px 4px 0 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Network size={14} /> Configuration Items
          </span>
          <div style={{ flex: 1 }} />
          {/* CI picker + add button */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 320 }}>
            <div style={{ flex: 1 }}>
              <CIPickerField
                value={pendingCI}
                onChange={setPendingCI}
                placeholder="Search or browse to link a CI…"
              />
            </div>
            <button
              onClick={handleAddCI}
              disabled={!pendingCI || addingCI}
              style={{ ...btnBase, background: pendingCI ? '#1565c0' : '#e5e7eb', color: pendingCI ? '#fff' : '#9ca3af', cursor: pendingCI ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
              {addingCI ? 'Adding…' : '+ Link'}
            </button>
          </div>
        </div>

        {(!task.task_cis || task.task_cis.length === 0) ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No CIs linked to this task. Use the search or Browse button above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['CI ID', 'Name', 'Type', 'Environment', 'IP', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f5f6f8', borderBottom: '1px solid var(--sn-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {task.task_cis.map(tci => (
                <tr key={tci.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <td style={{ padding: '7px 12px', fontSize: 11, fontFamily: 'monospace', color: '#7c3aed' }}>{tci.ci_detail?.ci_id}</td>
                  <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>{tci.ci_detail?.name}</td>
                  <td style={{ padding: '7px 12px' }}><CITypeBadge type={tci.ci_detail?.ci_type} small /></td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: '#6b7280' }}>{tci.ci_detail?.environment}</td>
                  <td style={{ padding: '7px 12px', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>{tci.ci_detail?.ip_address || '—'}</td>
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                      color: tci.ci_detail?.status === 'Operational' ? '#16a34a' : '#6b7280',
                      background: tci.ci_detail?.status === 'Operational' ? '#f0fdf4' : '#f9fafb' }}>
                      {tci.ci_detail?.status}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <button onClick={() => handleRemoveCI(tci.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer timestamps */}
      <div style={{ background: '#f9fafb', border: '1px solid var(--sn-border)', borderRadius: 4, padding: '8px 14px', fontSize: 12, color: '#6b7280', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span><strong>Created:</strong> {dt(task.created_at)}</span>
        <span><strong>Updated:</strong> {dt(task.updated_at)}</span>
        <span><strong>Order:</strong> #{task.order}</span>
        {task.assigned_to_detail && <span><strong>Assigned:</strong> {task.assigned_to_detail.first_name} {task.assigned_to_detail.last_name}</span>}
      </div>
    </div>
  );
}
