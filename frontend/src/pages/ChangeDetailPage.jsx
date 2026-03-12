import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, Paperclip, Send, CalendarCheck, FileText, StickyNote, CheckSquare, MessageSquare, Network, Lock, AlertCircle, Upload } from 'lucide-react';
import { getChange, updateChange, transitionChange, addComment, uploadAttachment } from '../api/changes';
import { PhasePipeline } from '../components/changes/PhasePipeline';
import { TasksSection } from '../components/changes/TasksSection';
import { WatsonChecklist } from '../components/watson/WatsonChecklist';
import { ChangeCITab } from '../components/cmdb/ChangeCITab';
import { StatusBadge } from '../components/common/StatusBadge';
import { FormField, TextInput, SelectInput, TextArea, DateTimeInput } from '../components/common/FormField';
import { VALID_TRANSITIONS, STATUS_CONFIG } from '../utils/statusConfig';
import { useAuth } from '../context/AuthContext';

const CATEGORY_OPTS   = [['','(Select)'],['Software','Software'],['Hardware','Hardware'],['Network','Network'],['Database','Database'],['Security','Security'],['Other','Other']];
const TYPE_OPTS       = [['Standard','Standard'],['Normal','Normal'],['Emergency','Emergency']];
const PRIORITY_OPTS   = [['1','1 - Critical'],['2','2 - High'],['3','3 - Moderate'],['4','4 - Low']];
const RISK_OPTS       = [['High','High'],['Medium','Medium'],['Low','Low']];
const IMPACT_OPTS     = [['1 - High','1 - High'],['2 - Medium','2 - Medium'],['3 - Low','3 - Low']];
const CLOSE_CODE_OPTS = [['','(Select)'],['Successful','Successful'],['Successful with issues','Successful with issues'],['Unsuccessful','Unsuccessful'],['Cancelled','Cancelled']];

// Role permissions mirroring backend
const TRANSITION_ROLE_REQUIRED = {
  ASSESS:    ['IMPLEMENTER','CAB_MANAGER','ADMIN'],
  AUTHORIZE: ['CAB_MEMBER','CAB_MANAGER','ADMIN'],
  SCHEDULED: ['CAB_MANAGER','ADMIN'],
  IMPLEMENT: ['IMPLEMENTER','CAB_MANAGER','ADMIN'],
  REVIEW:    ['IMPLEMENTER','CAB_MANAGER','ADMIN'],
  CLOSED:    ['CAB_MANAGER','ADMIN'],
  CANCELLED: ['IMPLEMENTER','CAB_MANAGER','ADMIN'],
};

const BOTTOM_TABS = [
  { key: 'cis',   label: 'Configuration Items', icon: Network },
  { key: 'tasks', label: 'Tasks',                icon: CheckSquare },
  { key: 'watson',label: 'Watson.ai',            icon: null },
];

const TOP_TABS = [
  { key: 'planning', label: 'Planning',            icon: FileText },
  { key: 'schedule', label: 'Schedule',            icon: CalendarCheck },
  { key: 'notes',    label: 'Notes',               icon: StickyNote },
  { key: 'closure',  label: 'Closure Information', icon: CheckSquare },
  { key: 'activity', label: 'Activity',            icon: MessageSquare },
];

function SectionHeader({ title }) {
  return <div style={{ gridColumn: '1 / -1', background: '#e8ecf0', padding: '5px 10px', marginBottom: 4, marginTop: 8, borderLeft: '3px solid #1565c0', fontSize: 12, fontWeight: 700, color: 'var(--sn-text-primary)', letterSpacing: '0.02em' }}>{title}</div>;
}
function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: '2px 12px', alignItems: 'center', padding: '6px 0' }}>{children}</div>;
}
function ActivityItem({ log }) {
  const c = { COMMENT: '#1565c0', STATUS_CHANGE: '#6c3483', WATSON_ACTION: '#00695c', CAB_DECISION: '#27ae60', ATTACHMENT: '#d35400', TASK_UPDATE: '#00838f' }[log.action_type] || '#555';
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--sn-border-light)' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${c}20`, border: `1px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: c, flexShrink: 0 }}>
        {log.user?.first_name?.[0]}{log.user?.last_name?.[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{log.user?.first_name} {log.user?.last_name}</span>
          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 2, background: `${c}15`, color: c }}>{log.action_type.replace('_', ' ')}</span>
          <span style={{ fontSize: 11, color: 'var(--sn-text-muted)', marginLeft: 'auto' }}>{new Date(log.created_at).toLocaleString()}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--sn-text-secondary)', lineHeight: 1.5 }}>{log.message}</div>
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', display: 'flex', overflowX: 'auto' }}>
      {tabs.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active === key ? 700 : 400, fontFamily: 'inherit',
          color: active === key ? 'var(--sn-blue)' : 'var(--sn-text-secondary)',
          borderBottom: `2px solid ${active === key ? 'var(--sn-blue)' : 'transparent'}`,
          whiteSpace: 'nowrap', marginBottom: -1, transition: 'var(--transition)',
        }}>{label}</button>
      ))}
    </div>
  );
}

export default function ChangeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [change, setChange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topTab, setTopTab] = useState('planning');
  const [bottomTab, setBottomTab] = useState('cis');
  const [comment, setComment] = useState('');
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const fileRef = useState(null);

  const load = useCallback(() => {
    return getChange(id).then(r => {
      setChange(r.data);
      setForm(r.data);
      setDirty(false);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setField = (f, v) => { setForm(p => ({ ...p, [f]: v })); setDirty(true); };
  const handleSave = async () => {
    setSaving(true);
    try { await updateChange(id, form); await load(); } finally { setSaving(false); }
  };

  const handleTransition = async (newStatus) => {
    setTransitionError('');
    if (!window.confirm(`Move to ${STATUS_CONFIG[newStatus]?.label}?`)) return;
    setTransitioning(true);
    try {
      await transitionChange(id, newStatus);
      await load();
    } catch (err) {
      const msg = err.response?.data?.error || 'Transition failed';
      setTransitionError(msg);
    } finally { setTransitioning(false); }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    await addComment(id, comment);
    setComment('');
    load();
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('attachment_type', change.status === 'IMPLEMENT' ? 'SCREENSHOT' : 'PROCEDURE');
    await uploadAttachment(id, fd);
    e.target.value = '';
    load();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--sn-text-muted)' }}>Loading...</div>;
  if (!change) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Record not found</div>;

  const transitions = VALID_TRANSITIONS[change.status] || [];
  const userRole = user?.role || '';

  const btnBase = { padding: '4px 12px', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 };

  const dt = (val) => val ? new Date(val).toLocaleString() : '—';

  return (
    <div style={{ animation: 'fadeIn 0.2s ease', paddingBottom: 40 }}>

      {/* ── Breadcrumb bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/changes')} style={{ ...btnBase, background: 'transparent', color: 'var(--sn-text-muted)', border: '1px solid var(--sn-border)', padding: '3px 8px', fontSize: 12 }}>
          <ChevronLeft size={13} /> Changes
        </button>
        <span style={{ color: 'var(--sn-text-muted)', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sn-blue)' }}>{change.ticket_number}</span>
        <StatusBadge status={change.status} />
        <div style={{ flex: 1 }} />
        {dirty && <button onClick={handleSave} disabled={saving} style={{ ...btnBase, background: 'var(--sn-green)', color: '#fff' }}>
          <Save size={13} /> {saving ? 'Saving...' : 'Save'}
        </button>}
        {transitions.map(ts => {
          const required = TRANSITION_ROLE_REQUIRED[ts] || [];
          const allowed  = required.length === 0 || required.includes(userRole);
          return (
            <button key={ts} onClick={() => allowed && handleTransition(ts)}
              disabled={!allowed || transitioning}
              title={!allowed ? `Requires: ${required.join(', ')}` : ''}
              style={{ ...btnBase, background: allowed ? (ts === 'CANCELLED' ? '#dc2626' : '#1565c0') : '#e5e7eb', color: allowed ? '#fff' : '#9ca3af', cursor: allowed ? 'pointer' : 'not-allowed', position: 'relative' }}>
              {!allowed && <Lock size={11} />}
              {STATUS_CONFIG[ts]?.label}
            </button>
          );
        })}
      </div>

      {/* Transition error banner */}
      {transitionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '10px 16px', margin: '10px 0', display: 'flex', alignItems: 'flex-start', gap: 10, color: '#dc2626', fontSize: 13 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>{transitionError}</div>
          <button onClick={() => setTransitionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}>✕</button>
        </div>
      )}

      {/* ── Phase pipeline ── */}
      <PhasePipeline currentStatus={change.status} />

      {/* ── Attachments strip — issue #2 ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sn-text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Paperclip size={13} /> Attachments
        </span>
        {change.attachments?.length > 0 ? (
          change.attachments.map(a => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, fontSize: 12, color: '#1d4ed8' }}>
              <Paperclip size={10} /> {a.filename}
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>{a.attachment_type}</span>
            </span>
          ))
        ) : (
          <span style={{ fontSize: 12, color: 'var(--sn-text-muted)' }}>No attachments</span>
        )}
        <label style={{ ...btnBase, background: 'var(--sn-green)', color: '#fff', cursor: 'pointer', fontSize: 12, padding: '3px 10px', marginLeft: 'auto' }}>
          <Upload size={12} /> Upload
          <input type="file" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>

      {/* ── Main header form ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', marginBottom: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Left */}
          <div style={{ padding: '10px 16px', borderRight: '1px solid var(--sn-border)' }}>
            <FormGrid>
              <SectionHeader title="Classification" />
              <FormField label="Number"><TextInput value={form.ticket_number} disabled /></FormField>
              <FormField label="Change Type"><SelectInput value={form.change_type} onChange={e => setField('change_type', e.target.value)} options={TYPE_OPTS} /></FormField>
              <FormField label="Category"><SelectInput value={form.category} onChange={e => setField('category', e.target.value)} options={CATEGORY_OPTS} /></FormField>
              <FormField label="Service"><TextInput value={form.service} onChange={e => setField('service', e.target.value)} /></FormField>
              <FormField label="Priority"><SelectInput value={form.priority} onChange={e => setField('priority', e.target.value)} options={PRIORITY_OPTS} /></FormField>
              <FormField label="Risk"><SelectInput value={form.risk_level} onChange={e => setField('risk_level', e.target.value)} options={RISK_OPTS} /></FormField>
              <FormField label="Impact"><SelectInput value={form.impact} onChange={e => setField('impact', e.target.value)} options={IMPACT_OPTS} /></FormField>
            </FormGrid>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginBottom: 4 }}>Short Description *</div>
              <TextInput value={form.short_description} onChange={e => setField('short_description', e.target.value)} />
              <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginTop: 8, marginBottom: 4 }}>Description</div>
              <TextArea value={form.description} onChange={e => setField('description', e.target.value)} rows={3} />
            </div>
          </div>

          {/* Right */}
          <div style={{ padding: '10px 16px' }}>
            <FormGrid>
              <SectionHeader title="Change Window" />
              <FormField label="Window Start"><DateTimeInput value={form.change_window_start} onChange={v => setField('change_window_start', v)} /></FormField>
              <FormField label="Window End"><DateTimeInput value={form.change_window_end} onChange={v => setField('change_window_end', v)} /></FormField>
              <FormField label="Planned Start"><DateTimeInput value={form.planned_start} onChange={v => setField('planned_start', v)} /></FormField>
              <FormField label="Planned End"><DateTimeInput value={form.planned_end} onChange={v => setField('planned_end', v)} /></FormField>

              <SectionHeader title="Actual Execution" />
              <FormField label="Actual Start">
                <TextInput value={dt(form.actual_start)} disabled style={{ color: form.actual_start ? '#16a34a' : '#9ca3af', fontFamily: 'monospace', fontSize: 12 }} />
              </FormField>
              <FormField label="Actual End">
                <TextInput value={dt(form.actual_end)} disabled style={{ color: form.actual_end ? '#16a34a' : '#9ca3af', fontFamily: 'monospace', fontSize: 12 }} />
              </FormField>

              <SectionHeader title="Assignment" />
              <FormField label="Assigned to"><TextInput value={form.assigned_to ? `${change.assigned_to_detail?.first_name || ''} ${change.assigned_to_detail?.last_name || ''}`.trim() : ''} disabled /></FormField>
              <FormField label="Assignment group"><TextInput value={form.assignment_group} onChange={e => setField('assignment_group', e.target.value)} /></FormField>
              <FormField label="Requester"><TextInput value={`${change.requester?.first_name || ''} ${change.requester?.last_name || ''}`.trim()} disabled /></FormField>
            </FormGrid>
          </div>
        </div>
      </div>

      {/* ── Top tabs: Planning / Schedule / Notes / Closure / Activity ── */}
      <TabBar tabs={TOP_TABS} active={topTab} onChange={setTopTab} />
      <div style={{ background: '#fff', padding: 16, borderBottom: '1px solid var(--sn-border)', minHeight: 120 }}>
        {topTab === 'planning' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[['Justification','justification','Why is this change needed?'],['Implementation Plan','implementation_plan','Step-by-step approach'],['Rollback Plan','rollback_plan','How to revert if things go wrong'],['Test Plan','test_plan','How to validate success']].map(([label, field, ph]) => (
              <div key={field}>
                <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginBottom: 4 }}>{label}</div>
                <TextArea value={form[field]} onChange={e => setField(field, e.target.value)} rows={4} placeholder={ph} />
              </div>
            ))}
          </div>
        )}
        {topTab === 'schedule' && (
          <FormGrid>
            <SectionHeader title="Planned Schedule" />
            <FormField label="Window Start"><DateTimeInput value={form.change_window_start} onChange={v => setField('change_window_start', v)} /></FormField>
            <FormField label="Window End"><DateTimeInput value={form.change_window_end} onChange={v => setField('change_window_end', v)} /></FormField>
            <FormField label="Planned Start"><DateTimeInput value={form.planned_start} onChange={v => setField('planned_start', v)} /></FormField>
            <FormField label="Planned End"><DateTimeInput value={form.planned_end} onChange={v => setField('planned_end', v)} /></FormField>
            <SectionHeader title="Actual Execution (auto-recorded)" />
            <FormField label="Actual Start"><TextInput value={dt(change.actual_start)} disabled style={{ fontFamily: 'monospace', fontSize: 12, color: '#16a34a' }} /></FormField>
            <FormField label="Actual End"><TextInput value={dt(change.actual_end)} disabled style={{ fontFamily: 'monospace', fontSize: 12, color: '#16a34a' }} /></FormField>
          </FormGrid>
        )}
        {topTab === 'notes' && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginBottom: 4 }}>Work Notes / Additional Information</div>
            <TextArea value={form.description} onChange={e => setField('description', e.target.value)} rows={6} placeholder="Internal notes..." />
          </div>
        )}
        {topTab === 'closure' && (
          <FormGrid>
            <SectionHeader title="Closure Information" />
            <FormField label="Close Code"><SelectInput value={form.close_code} onChange={e => setField('close_code', e.target.value)} options={CLOSE_CODE_OPTS} /></FormField>
            <FormField label="Close Notes"><TextArea value={form.close_notes} onChange={e => setField('close_notes', e.target.value)} rows={3} /></FormField>
          </FormGrid>
        )}
        {topTab === 'activity' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              {change.activity_logs?.length === 0
                ? <div style={{ color: 'var(--sn-text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No activity yet</div>
                : change.activity_logs?.map(log => <ActivityItem key={log.id} log={log} />)}
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--sn-border-light)' }}>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add comment..." rows={2}
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--sn-border)', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
              <button onClick={handleComment} style={{ padding: '6px 14px', background: 'var(--sn-blue)', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                <Send size={13} /> Post
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom tabs: CIs / Tasks / Watson ── */}
      <div style={{ marginTop: 8 }}>
        <TabBar tabs={BOTTOM_TABS} active={bottomTab} onChange={setBottomTab} />
        <div style={{ background: '#fff', padding: 16 }}>
          {bottomTab === 'cis'    && <ChangeCITab change={change} onRefresh={load} />}
          {bottomTab === 'tasks'  && <TasksSection changeId={change.id} tasks={change.tasks || []} onRefresh={load} />}
          {bottomTab === 'watson' && <WatsonChecklist change={change} />}
        </div>
      </div>
    </div>
  );
}
