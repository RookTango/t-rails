import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Save, X, Search, Clock, CheckCircle2 } from 'lucide-react';
import { createTask, updateTask, deleteTask } from '../../api/changes';
import { searchCIs } from '../../api/cmdb';
import { CITypeBadge } from '../cmdb/CITypeBadge';

const STATUS_OPTS = [['Open','Open'],['In Progress','In Progress'],['Completed','Completed'],['Skipped','Skipped'],['Cancelled','Cancelled']];
const STATUS_COLOR = { 'Open':'#1565c0','In Progress':'#d97706','Completed':'#16a34a','Skipped':'#6b7280','Cancelled':'#dc2626' };
const STATUS_BG    = { 'Open':'#eff6ff','In Progress':'#fff7ed','Completed':'#f0fdf4','Skipped':'#f9fafb','Cancelled':'#fef2f2' };

function CIPicker({ value, onChange }) {
  const [query, setQuery]   = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);
  const ref = useRef(null);

  const search = (q) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    searchCIs(q).then(r => { setResults(r.data); setOpen(true); });
  };
  const select = (ci) => { onChange(ci); setQuery(ci.name); setOpen(false); };
  const clear  = ()   => { onChange(null); setQuery(''); };

  const iStyle = { padding: '3px 6px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', outline: 'none', flex: 1 };
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      <Search size={12} color="#9ca3af" style={{ flexShrink: 0 }} />
      <input value={query} onChange={e => search(e.target.value)} placeholder="Search CI..."
        style={iStyle} onFocus={() => results.length > 0 && setOpen(true)} />
      {value && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>}
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #c0c8d4', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 50, maxHeight: 180, overflowY: 'auto' }}>
          {results.map(ci => (
            <div key={ci.id} onClick={() => select(ci)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f5f5f5' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <CITypeBadge type={ci.ci_type} small />
              <div><div style={{ fontWeight: 600 }}>{ci.name}</div><div style={{ color: '#9ca3af', fontSize: 10 }}>{ci.ci_id}{ci.ip_address ? ` · ${ci.ip_address}` : ''}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DateInput({ value, onChange, disabled }) {
  return <input type="datetime-local" value={value ? value.slice(0,16) : ''} onChange={e => onChange(e.target.value || null)} disabled={disabled}
    style={{ padding: '3px 5px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 11, fontFamily: 'inherit', outline: 'none', width: '100%', background: disabled ? '#f9fafb' : '#fff' }} />;
}

function TaskRow({ task, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [form, setForm] = useState({
    short_description: task.short_description,
    description: task.description,
    assignment_group: task.assignment_group,
    status: task.status,
    ci: task.ci_detail || null,
    planned_start: task.planned_start,
    planned_end:   task.planned_end,
  });

  const handleSave = async () => {
    await updateTask(task.id, { ...form, ci: form.ci?.id || null });
    setEditing(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    await deleteTask(task.id);
    onRefresh();
  };

  const inp = { padding: '3px 6px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' };
  const fmtDt = (v) => v ? new Date(v).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const ci = task.ci_detail;

  return (
    <>
      <tr style={{ background: '#fff' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
        <td style={{ padding: '6px 8px', width: 28 }}>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </td>
        <td style={{ padding: '6px 10px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#1565c0', whiteSpace: 'nowrap' }}>{task.task_number}</td>
        <td style={{ padding: '6px 10px', fontSize: 13 }}>
          {editing ? <input value={form.short_description} onChange={e => setForm(p => ({...p, short_description: e.target.value}))} style={inp} /> : task.short_description}
        </td>
        <td style={{ padding: '6px 10px', minWidth: 150 }}>
          {editing ? <CIPicker value={form.ci} onChange={ci => setForm(p => ({...p, ci}))} />
          : ci ? <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CITypeBadge type={ci.ci_type} small /><span style={{ fontSize: 12 }}>{ci.name}</span></div>
          : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
        </td>
        <td style={{ padding: '6px 10px', fontSize: 12, color: '#6b7280' }}>
          {editing ? <input value={form.assignment_group} onChange={e => setForm(p => ({...p, assignment_group: e.target.value}))} style={inp} placeholder="Group" /> : (task.assignment_group || '—')}
        </td>
        {/* Planned dates */}
        <td style={{ padding: '6px 10px', minWidth: 120 }}>
          {editing ? <DateInput value={form.planned_start} onChange={v => setForm(p => ({...p, planned_start: v}))} />
          : <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDt(task.planned_start)}</span>}
        </td>
        <td style={{ padding: '6px 10px', minWidth: 120 }}>
          {editing ? <DateInput value={form.planned_end} onChange={v => setForm(p => ({...p, planned_end: v}))} />
          : <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDt(task.planned_end)}</span>}
        </td>
        {/* Actual dates — read-only, auto-set by backend */}
        <td style={{ padding: '6px 10px', minWidth: 120 }}>
          <span style={{ fontSize: 11, color: task.actual_start ? '#16a34a' : '#9ca3af', fontFamily: 'monospace' }}>{fmtDt(task.actual_start)}</span>
        </td>
        <td style={{ padding: '6px 10px', minWidth: 120 }}>
          <span style={{ fontSize: 11, color: task.actual_end ? '#16a34a' : '#9ca3af', fontFamily: 'monospace' }}>{fmtDt(task.actual_end)}</span>
        </td>
        <td style={{ padding: '6px 10px' }}>
          {editing
            ? <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))} style={{ ...inp, width: 'auto' }}>
                {STATUS_OPTS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            : <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 3, color: STATUS_COLOR[task.status], background: STATUS_BG[task.status] }}>{task.status}</span>}
        </td>
        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
          {editing
            ? <><button onClick={handleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', marginRight: 6 }}><Save size={14} /></button>
                <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button></>
            : <><button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', marginRight: 6 }}><Pencil size={13} /></button>
                <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={13} /></button></>}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid var(--sn-border-light)' }}>
          <td colSpan={11} style={{ padding: '10px 18px 14px 46px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Description</div>
            {editing
              ? <textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={3} style={{ ...inp, resize: 'vertical', height: 'auto', padding: '5px 8px', width: '100%' }} />
              : <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{task.description || <em style={{ color: '#9ca3af' }}>No description</em>}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

export function TasksSection({ changeId, tasks, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ short_description: '', description: '', assignment_group: '', status: 'Open', selectedCI: null, planned_start: '', planned_end: '' });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.short_description.trim()) return;
    setSaving(true);
    try {
      await createTask(changeId, {
        short_description: form.short_description,
        description: form.description,
        assignment_group: form.assignment_group,
        status: form.status,
        ci: form.selectedCI?.id || null,
        planned_start: form.planned_start || null,
        planned_end:   form.planned_end   || null,
      });
      setForm({ short_description: '', description: '', assignment_group: '', status: 'Open', selectedCI: null, planned_start: '', planned_end: '' });
      setShowForm(false);
      onRefresh();
    } finally { setSaving(false); }
  };

  const inp = { padding: '4px 8px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', height: 28 };
  const hdr = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f5f6f8', borderBottom: '1px solid var(--sn-border)', whiteSpace: 'nowrap' };

  return (
    <div style={{ border: '1px solid var(--sn-border)', borderRadius: 4, background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '8px 12px', background: '#f0f3f7', borderBottom: '1px solid var(--sn-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px 4px 0 0' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Change Tasks ({tasks.length})</span>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: '#00b388', border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={13} /> New Task
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '12px 14px', background: '#f9fbff', borderBottom: '1px solid var(--sn-border-light)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Short Description *</div>
              <input value={form.short_description} onChange={e => setForm(p => ({...p, short_description: e.target.value}))} style={inp} placeholder="Task title" /></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>CI</div>
              <CIPicker value={form.selectedCI} onChange={ci => setForm(p => ({...p, selectedCI: ci}))} /></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Status</div>
              <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))} style={{ ...inp, cursor: 'pointer' }}>
                {STATUS_OPTS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Assignment Group</div>
              <input value={form.assignment_group} onChange={e => setForm(p => ({...p, assignment_group: e.target.value}))} style={inp} /></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Planned Start</div>
              <input type="datetime-local" value={form.planned_start} onChange={e => setForm(p => ({...p, planned_start: e.target.value}))} style={{ ...inp, fontSize: 11 }} /></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Planned End</div>
              <input type="datetime-local" value={form.planned_end} onChange={e => setForm(p => ({...p, planned_end: e.target.value}))} style={{ ...inp, fontSize: 11 }} /></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Description</div>
              <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={saving} style={{ padding: '5px 14px', background: '#1565c0', border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving...' : 'Add Task'}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '5px 14px', background: '#fff', border: '1px solid #c0c8d4', borderRadius: 3, color: '#6b7280', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No tasks yet. Click "New Task" to add one.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...hdr, width: 28 }} />
                {['Task #','Description','CI','Assignment Group','Planned Start','Planned End','Actual Start','Actual End','Status',''].map(h => <th key={h} style={hdr}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => <TaskRow key={task.id} task={task} onRefresh={onRefresh} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
