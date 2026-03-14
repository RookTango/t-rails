import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { createChange } from '../api/changes';
import { FormField, TextInput, SelectInput, TextArea, DateTimeInput } from '../components/common/FormField';
import { CIPickerField } from '../components/cmdb/CIPickerField';

export default function NewChangePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const [form, setForm] = useState({
    short_description: '', description: '', change_type: 'Normal',
    priority: '3', risk_level: 'Medium', impact: '2 - Medium',
    category: '', service: '', assignment_group: '',
    change_window_start: '', change_window_end: '',
    justification: '', implementation_plan: '', rollback_plan: '', test_plan: '',
    ci_impact_depth: 'full',
  });
  const [selectedCI, setSelectedCI] = useState(null);   // CI object for picker
  const [tasks, setTasks] = useState([
    { short_description: '', description: '', assignment_group: '', ci: null }
  ]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const addTask = () => setTasks(p => [...p, { short_description: '', description: '', assignment_group: '', ci: null }]);
  const removeTask = (i) => setTasks(p => p.filter((_, idx) => idx !== i));
  const setTask = (i, f, v) => setTasks(p => p.map((t, idx) => idx === i ? { ...t, [f]: v } : t));

  const btnBase = { padding: '6px 16px', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 };

  const handleSubmit = async () => {
    if (!form.short_description.trim()) { setError('Short description is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        configuration_item: selectedCI?.name || '',
      };
      const r = await createChange(payload);
      navigate(`/changes/${r.data.id}`);
    } catch (e) {
      setError(e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Failed to create change');
    } finally { setSaving(false); }
  };

  const sectionHdr = (label) => (
    <div style={{ background: '#e8ecf0', padding: '5px 10px', borderLeft: '3px solid var(--sn-blue)', fontSize: 12, fontWeight: 700, color: 'var(--sn-text-primary)', marginBottom: 8 }}>{label}</div>
  );

  return (
    <div style={{ animation: 'fadeIn .2s ease' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--sn-border)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/changes')} style={{ ...btnBase, background: '#f0f3f7', color: '#374151', border: '1px solid var(--sn-border)' }}>
          <ChevronLeft size={13} /> Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 700 }}>New Change Request</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleSubmit} disabled={saving}
          style={{ ...btnBase, background: saving ? '#9ca3af' : 'var(--sn-green)', color: '#fff' }}>
          {saving ? 'Submitting…' : 'Submit Change'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 14px', marginBottom: 10, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left column */}
        <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 14 }}>
          {sectionHdr('Change Information')}
          <FormField label="Short Description" required>
            <TextInput value={form.short_description} onChange={e => set('short_description', e.target.value)} placeholder="Brief summary of the change" />
          </FormField>
          <FormField label="Category">
            <SelectInput value={form.category} onChange={e => set('category', e.target.value)} options={[['','— Select —'],['Software','Software'],['Hardware','Hardware'],['Network','Network'],['Security','Security'],['Database','Database'],['Infrastructure','Infrastructure'],['Other','Other']]} />
          </FormField>
          <FormField label="Change Type">
            <SelectInput value={form.change_type} onChange={e => set('change_type', e.target.value)} options={[['Normal','Normal'],['Standard','Standard'],['Emergency','Emergency']]} />
          </FormField>
          <FormField label="Priority">
            <SelectInput value={form.priority} onChange={e => set('priority', e.target.value)} options={[['1','1 - Critical'],['2','2 - High'],['3','3 - Moderate'],['4','4 - Low']]} />
          </FormField>
          <FormField label="Risk Level">
            <SelectInput value={form.risk_level} onChange={e => set('risk_level', e.target.value)} options={[['Low','Low'],['Medium','Medium'],['High','High'],['Very High','Very High']]} />
          </FormField>
          <FormField label="Impact">
            <SelectInput value={form.impact} onChange={e => set('impact', e.target.value)} options={[['1 - High','1 - High'],['2 - Medium','2 - Medium'],['3 - Low','3 - Low']]} />
          </FormField>
          <FormField label="Assignment Group">
            <TextInput value={form.assignment_group} onChange={e => set('assignment_group', e.target.value)} placeholder="e.g. Infrastructure Team" />
          </FormField>
          <FormField label="Service">
            <TextInput value={form.service} onChange={e => set('service', e.target.value)} placeholder="Affected service" />
          </FormField>

          {sectionHdr('Configuration Item')}
          <FormField label="Primary CI">
            <CIPickerField
              value={selectedCI}
              onChange={setSelectedCI}
              placeholder="Search or browse to select a CI…"
            />
          </FormField>
          <FormField label="CI Impact Depth">
            <SelectInput value={form.ci_impact_depth} onChange={e => set('ci_impact_depth', e.target.value)}
              options={[['1','1 Level — Direct only'],['2','2 Levels'],['full','Full Tree']]} />
          </FormField>

          {sectionHdr('Schedule')}
          <FormField label="Change Window Start">
            <DateTimeInput value={form.change_window_start} onChange={v => set('change_window_start', v)} />
          </FormField>
          <FormField label="Change Window End">
            <DateTimeInput value={form.change_window_end} onChange={v => set('change_window_end', v)} />
          </FormField>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 14 }}>
            {sectionHdr('Description')}
            <FormField label="Detailed Description">
              <TextArea value={form.description} onChange={e => set('description', e.target.value)} rows={4} placeholder="Full description of the change…" />
            </FormField>
            <FormField label="Justification">
              <TextArea value={form.justification} onChange={e => set('justification', e.target.value)} rows={3} placeholder="Business reason for this change…" />
            </FormField>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 14 }}>
            {sectionHdr('Plans')}
            <FormField label="Implementation Plan">
              <TextArea value={form.implementation_plan} onChange={e => set('implementation_plan', e.target.value)} rows={3} placeholder="Step-by-step implementation plan…" />
            </FormField>
            <FormField label="Rollback Plan">
              <TextArea value={form.rollback_plan} onChange={e => set('rollback_plan', e.target.value)} rows={3} placeholder="How to reverse this change if it fails…" />
            </FormField>
            <FormField label="Test Plan">
              <TextArea value={form.test_plan} onChange={e => set('test_plan', e.target.value)} rows={2} placeholder="How will you validate success?…" />
            </FormField>
          </div>

          {/* Tasks */}
          <div style={{ background: '#fff', border: '1px solid var(--sn-border)', borderRadius: 4, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              {sectionHdr('Tasks')}
              <button onClick={addTask} style={{ ...btnBase, background: 'var(--sn-blue)', color: '#fff', padding: '3px 10px', fontSize: 12 }}>
                <Plus size={12} /> Add Task
              </button>
            </div>
            {tasks.map((task, i) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 10, marginBottom: 8, background: '#f9fafb' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>Task {i + 1}</span>
                  {tasks.length > 1 && (
                    <button onClick={() => removeTask(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Short Description *</div>
                    <TextInput value={task.short_description} onChange={e => setTask(i, 'short_description', e.target.value)} placeholder="Task name" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Assignment Group</div>
                    <TextInput value={task.assignment_group} onChange={e => setTask(i, 'assignment_group', e.target.value)} placeholder="Team" />
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Configuration Item</div>
                  <CIPickerField
                    value={task.ci}
                    onChange={ci => setTask(i, 'ci', ci)}
                    placeholder="Search or browse CI for this task…"
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Description</div>
                  <TextArea value={task.description} onChange={e => setTask(i, 'description', e.target.value)} rows={2} placeholder="Task details…" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
