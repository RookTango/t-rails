import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { createChange, createTask } from '../api/changes';
import { FormField, TextInput, SelectInput, TextArea, DateTimeInput } from '../components/common/FormField';

const TYPE_OPTS = [['Standard','Standard'],['Normal','Normal'],['Emergency','Emergency']];
const PRIORITY_OPTS = [['1','1 - Critical'],['2','2 - High'],['3','3 - Moderate'],['4','4 - Low']];
const RISK_OPTS = [['High','High'],['Medium','Medium'],['Low','Low']];
const IMPACT_OPTS = [['1 - High','1 - High'],['2 - Medium','2 - Medium'],['3 - Low','3 - Low']];
const CATEGORY_OPTS = [['','(Select)'],['Software','Software'],['Hardware','Hardware'],['Network','Network'],['Database','Database'],['Security','Security'],['Other','Other']];

function SectionHeader({ title }) {
  return <div style={{ gridColumn: '1 / -1', background: '#e8ecf0', padding: '5px 10px', marginBottom: 2, marginTop: 10, borderLeft: '3px solid #1565c0', fontSize: 12, fontWeight: 700 }}>{title}</div>;
}

export default function NewChangePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ short_description: '', description: '', change_type: 'Normal', priority: '3', risk_level: 'Medium', impact: '2 - Medium', category: '', service: '', configuration_item: '', assignment_group: '', change_window_start: '', change_window_end: '', justification: '', implementation_plan: '', rollback_plan: '', test_plan: '', ci_impact_depth: 'full' });
  const [tasks, setTasks] = useState([{ short_description: '', description: '', configuration_item: '', assignment_group: '' }]);
  const set = (f, v) => setForm(p => ({...p, [f]: v}));

  const addTask = () => setTasks(p => [...p, { short_description: '', description: '', configuration_item: '', assignment_group: '' }]);
  const removeTask = (i) => setTasks(p => p.filter((_, idx) => idx !== i));
  const setTask = (i, f, v) => setTasks(p => p.map((t, idx) => idx === i ? {...t, [f]: v} : t));

  const handleSubmit = async () => {
    if (!form.short_description.trim()) return alert('Short description is required');
    if (!form.change_window_start || !form.change_window_end) return alert('Change window (start and end) is required');
    setLoading(true);
    try {
      const res = await createChange(form);
      const change = res.data;
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].short_description.trim()) await createTask(change.id, { ...tasks[i], order: i + 1 });
      }
      navigate(`/changes/${change.id}`);
    } catch (err) {
      alert('Error: ' + JSON.stringify(err.response?.data));
    } finally { setLoading(false); }
  };

  const sectionStyle = { background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, marginBottom: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' };
  const sectionTitleStyle = { padding: '8px 14px', background: '#f0f3f7', borderBottom: '1px solid var(--sn-border)', fontSize: 13, fontWeight: 700, color: 'var(--sn-text-primary)' };
  const gridStyle = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: '4px 16px', padding: '12px 14px', alignItems: 'center' };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', animation: 'fadeIn 0.2s ease' }}>
      {/* Header bar */}
      <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={() => navigate('/changes')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--sn-border)', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--sn-text-secondary)', fontFamily: 'inherit' }}>
          <ChevronLeft size={13} /> All Changes
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>New Change Request</h1>
        <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 18px', background: 'var(--sn-green)', border: 'none', borderRadius: 3, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
        <button onClick={() => navigate('/changes')} style={{ padding: '6px 14px', background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 3, color: 'var(--sn-text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
      </div>

      {/* Main form */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Change Information</div>
        <div style={gridStyle}>
          <SectionHeader title="Basic Details" />
          <FormField label="Short Description" required><TextInput value={form.short_description} onChange={e => set('short_description', e.target.value)} placeholder="Brief title of the change" /></FormField>
          <FormField label="Change Type"><SelectInput value={form.change_type} onChange={e => set('change_type', e.target.value)} options={TYPE_OPTS} /></FormField>
          <FormField label="Category"><SelectInput value={form.category} onChange={e => set('category', e.target.value)} options={CATEGORY_OPTS} /></FormField>
          <FormField label="Priority"><SelectInput value={form.priority} onChange={e => set('priority', e.target.value)} options={PRIORITY_OPTS} /></FormField>
          <FormField label="Service"><TextInput value={form.service} onChange={e => set('service', e.target.value)} /></FormField>
          <FormField label="Risk"><SelectInput value={form.risk_level} onChange={e => set('risk_level', e.target.value)} options={RISK_OPTS} /></FormField>
          <FormField label="Configuration Item"><TextInput value={form.configuration_item} onChange={e => set('configuration_item', e.target.value)} placeholder="Affected CI" /></FormField>
          <FormField label="Impact"><SelectInput value={form.impact} onChange={e => set('impact', e.target.value)} options={IMPACT_OPTS} /></FormField>
          <FormField label="CI Impact Depth"><SelectInput value={form.ci_impact_depth} onChange={e => set('ci_impact_depth', e.target.value)} options={[['1','1 Level — Direct only'],['2','2 Levels'],['full','Full Tree (all descendants)']]} /></FormField>
          <FormField label="Assignment Group"><TextInput value={form.assignment_group} onChange={e => set('assignment_group', e.target.value)} /></FormField>

          <SectionHeader title="Change Window *" />
          <FormField label="Window Start" required><DateTimeInput value={form.change_window_start} onChange={v => set('change_window_start', v)} /></FormField>
          <FormField label="Window End" required><DateTimeInput value={form.change_window_end} onChange={v => set('change_window_end', v)} /></FormField>
          <FormField label="Planned Start"><DateTimeInput value={form.planned_start} onChange={v => set('planned_start', v)} /></FormField>
          <FormField label="Planned End"><DateTimeInput value={form.planned_end} onChange={v => set('planned_end', v)} /></FormField>
        </div>

        <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginBottom: 4 }}>Description</div>
            <TextArea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Detailed description of the change..." />
          </div>
        </div>
      </div>

      {/* Planning section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Planning</div>
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Justification', 'justification', 'Why is this change needed?'],
            ['Implementation Plan', 'implementation_plan', 'Step-by-step approach'],
            ['Rollback Plan', 'rollback_plan', 'How to revert if things go wrong'],
            ['Test Plan', 'test_plan', 'How you will validate success'],
          ].map(([label, field, placeholder]) => (
            <div key={field}>
              <div style={{ fontSize: 12, color: 'var(--sn-text-label)', marginBottom: 4 }}>{label}</div>
              <TextArea value={form[field]} onChange={e => set(field, e.target.value)} rows={3} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div style={sectionStyle}>
        <div style={{ ...sectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Change Tasks</span>
          <button onClick={addTask} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--sn-green)', border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> Add Task
          </button>
        </div>
        <div style={{ padding: '10px 14px' }}>
          {tasks.map((task, i) => (
            <div key={i} style={{ padding: 12, background: '#f9fafb', border: '1px solid var(--sn-border-light)', borderRadius: 3, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sn-text-secondary)' }}>Task {i + 1}</span>
                {tasks.length > 1 && <button onClick={() => removeTask(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sn-red)', padding: 0 }}><Trash2 size={13} /></button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[['short_description','Short Description *',true],['configuration_item','Configuration Item',false],['assignment_group','Assignment Group',false]].map(([f,l]) => (
                  <div key={f}>
                    <div style={{ fontSize: 11, color: 'var(--sn-text-label)', marginBottom: 3 }}>{l}</div>
                    <TextInput value={task[f]} onChange={e => setTask(i, f, e.target.value)} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--sn-text-label)', marginBottom: 3 }}>Description</div>
              <TextArea value={task.description} onChange={e => setTask(i, 'description', e.target.value)} rows={2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
