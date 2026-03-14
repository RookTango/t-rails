import { useState, useEffect, useRef, useCallback } from 'react';
import { generateChecklist, getChecklist, acceptItem, passiveScore, exportChecklist } from '../../api/watson';
import api from '../../api/client';
import {
  Cpu, ChevronDown, ChevronRight, Check, X, AlertTriangle, Terminal,
  Info, Upload, Download, RefreshCw, Shield, Loader, CheckCircle2,
  Lock, Layers, ListChecks, Zap
} from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────
const ACCEPT_CFG = {
  PENDING:  { color: '#9ca3af', bg: '#f9fafb',  label: 'Pending'  },
  ACCEPTED: { color: '#16a34a', bg: '#f0fdf4',  label: 'Accepted' },
  REJECTED: { color: '#dc2626', bg: '#fef2f2',  label: 'Rejected' },
  MODIFIED: { color: '#d97706', bg: '#fff7ed',  label: 'Modified' },
};

const IMPL_CFG = {
  NOT_RUN: { color: '#9ca3af', bg: '#f9fafb', label: '—',          icon: null     },
  PASS:    { color: '#16a34a', bg: '#f0fdf4', label: 'Pass',       icon: '✓'      },
  FAIL:    { color: '#dc2626', bg: '#fef2f2', label: 'Fail',       icon: '✗'      },
  CAUTION: { color: '#d97706', bg: '#fff7ed', label: 'Caution',    icon: '⚠'      },
  SKIPPED: { color: '#6b7280', bg: '#f9fafb', label: 'Skipped',    icon: '⊘'      },
};

const GROUP_TYPE_CFG = {
  PRE:  { color: '#1565c0', label: 'Pre-Implementation',  icon: '⬤' },
  TASK: { color: '#7c3aed', label: 'Task',                icon: '⬡' },
  POST: { color: '#16a34a', label: 'Post-Implementation', icon: '⬤' },
};

// ── Single item ────────────────────────────────────────────────────────────
function ItemRow({ item, canAccept, isImplement }) {
  const [expanded, setExpanded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [note, setNote] = useState(item.acceptance_note || '');
  const [localItem, setLocal] = useState(item);

  useEffect(() => { setLocal(item); }, [item]);

  const ac = ACCEPT_CFG[localItem.acceptance] || ACCEPT_CFG.PENDING;
  const im = IMPL_CFG[localItem.impl_result]  || IMPL_CFG.NOT_RUN;
  const isRejected = localItem.acceptance === 'REJECTED';

  const doAccept = async (decision) => {
    setAccepting(true);
    try {
      const r = await acceptItem(localItem.id, { acceptance: decision, note });
      setLocal(r.data);
    } finally { setAccepting(false); }
  };

  return (
    <div style={{ marginBottom: 2, opacity: isRejected ? 0.45 : 1 }}>
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '7px 10px',
          background: isRejected ? '#fff5f5' : '#fff',
          border: `1px solid ${isRejected ? '#fecaca' : '#e9ecef'}`,
          borderRadius: expanded ? '4px 4px 0 0' : 4,
          cursor: 'pointer', userSelect: 'none',
        }}>
        <span style={{ color: '#c0c8d4', marginTop: 2, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 700, flexShrink: 0, minWidth: 55 }}>
          {localItem.code}
        </span>
        <span style={{ fontSize: 13, flex: 1, lineHeight: 1.4, color: isRejected ? '#9ca3af' : '#1e293b' }}>
          {localItem.description}
        </span>

        {localItem.command_hint && (
          <span title={localItem.command_hint} style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 6px', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Terminal size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            {localItem.command_hint.split(/\s+/)[0]}…
          </span>
        )}

        {localItem.caution && <AlertTriangle size={12} color="#d97706" title={localItem.caution} style={{ flexShrink: 0 }} />}

        {/* Acceptance badge */}
        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: ac.color, background: ac.bg, flexShrink: 0 }}>
          {ac.label}
        </span>

        {/* Impl result badge */}
        {localItem.impl_result !== 'NOT_RUN' && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: im.color, background: im.bg, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            {im.icon} {im.label}
            {localItem.impl_auto_scored && <Zap size={9} title="Auto-scored by Watson" />}
          </span>
        )}

        {/* Accept/Reject buttons */}
        {canAccept && localItem.acceptance === 'PENDING' && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => doAccept('ACCEPTED')} disabled={accepting}
              style={{ padding: '2px 7px', background: '#16a34a', border: 'none', borderRadius: 3, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit' }}>
              <Check size={10} /> Accept
            </button>
            <button onClick={() => doAccept('REJECTED')} disabled={accepting}
              style={{ padding: '2px 7px', background: '#dc2626', border: 'none', borderRadius: 3, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit' }}>
              <X size={10} /> Reject
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ background: '#f8fafc', border: '1px solid #e9ecef', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '10px 14px 12px 32px' }}>
          {localItem.rationale && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Info size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Why Watson included this
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{localItem.rationale}</div>
            </div>
          )}

          {localItem.command_hint && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Terminal size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Suggested Command
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#1e293b', color: '#7dd3fc', padding: '7px 10px', borderRadius: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {localItem.command_hint}
              </div>
            </div>
          )}

          {localItem.caution && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '6px 10px', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 2 }}>
                <AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />Watson Caution
              </div>
              <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>{localItem.caution}</div>
            </div>
          )}

          {/* Accept with note */}
          {canAccept && (
            <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Override note</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Optional modification note…"
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <button onClick={() => doAccept('MODIFIED')}
                  style={{ padding: '4px 10px', background: '#d97706', border: 'none', borderRadius: 3, color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Accept with note
                </button>
              </div>
            </div>
          )}

          {/* Acceptance record */}
          {localItem.acceptance !== 'PENDING' && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              {localItem.acceptance} by {localItem.accepted_by_detail?.first_name} {localItem.accepted_by_detail?.last_name}
              {localItem.accepted_at && ` · ${new Date(localItem.accepted_at).toLocaleString()}`}
              {localItem.acceptance_note && <em style={{ marginLeft: 6, color: '#475569' }}>"{localItem.acceptance_note}"</em>}
            </div>
          )}

          {/* Watson impl result */}
          {localItem.impl_result !== 'NOT_RUN' && (
            <div style={{ marginTop: 8, background: im.bg, border: `1px solid ${im.color}40`, borderRadius: 4, padding: '6px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: im.color, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                Watson: {im.label}
                {localItem.impl_auto_scored && <span style={{ fontSize: 10, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 2 }}><Zap size={9} /> Auto-scored from activity</span>}
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{localItem.impl_watson_note}</div>
              {localItem.impl_validated_at && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{new Date(localItem.impl_validated_at).toLocaleString()}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Group block ────────────────────────────────────────────────────────────
function GroupBlock({ group, canAccept, isImplement }) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = GROUP_TYPE_CFG[group.group_type] || GROUP_TYPE_CFG.PRE;
  const items = group.items || [];
  const total    = items.length;
  const accepted = items.filter(i => i.acceptance !== 'PENDING' && i.acceptance !== 'REJECTED').length;
  const passed   = items.filter(i => i.impl_result === 'PASS').length;
  const failed   = items.filter(i => i.impl_result === 'FAIL').length;
  const allResolved = total > 0 && accepted + items.filter(i => i.acceptance === 'REJECTED').length === total;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Group header */}
      <div
        onClick={() => setCollapsed(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', cursor: 'pointer', userSelect: 'none',
          background: `${cfg.color}08`,
          border: `1px solid ${cfg.color}25`,
          borderLeft: `4px solid ${cfg.color}`,
          borderRadius: collapsed ? 4 : '4px 4px 0 0',
        }}>
        {collapsed ? <ChevronRight size={13} color={cfg.color} /> : <ChevronDown size={13} color={cfg.color} />}

        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: cfg.color }}>{group.code}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', flex: 1 }}>{group.title}</span>

        {/* Task link badge */}
        {group.task_detail && (
          <span style={{ fontSize: 11, color: '#7c3aed', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '1px 8px', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={group.task_detail.short_description}>
            ⬡ {group.task_detail.task_number}
          </span>
        )}

        {/* Phase label */}
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}12`, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          {group.phase || cfg.label}
        </span>

        {/* Progress */}
        {isImplement ? (
          <span style={{ fontSize: 12, color: failed > 0 ? '#dc2626' : passed > 0 ? '#16a34a' : '#64748b', fontWeight: 500, flexShrink: 0 }}>
            {passed > 0 && `✓${passed} `}{failed > 0 && `✗${failed} `}{passed + failed}/{total}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: allResolved ? '#16a34a' : '#64748b', fontWeight: 500, flexShrink: 0 }}>
            {allResolved && <CheckCircle2 size={12} style={{ verticalAlign: 'middle', marginRight: 3, color: '#16a34a' }} />}
            {accepted}/{total} reviewed
          </span>
        )}
      </div>

      {/* Items */}
      {!collapsed && (
        <div style={{ border: `1px solid ${cfg.color}20`, borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '8px 12px', background: '#fdfdfe' }}>
          {items.length === 0
            ? <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>No items in this group.</div>
            : items.map(item => <ItemRow key={item.id} item={item} canAccept={canAccept} isImplement={isImplement} />)
          }
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function WatsonChecklist({ change }) {
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scoring, setScoring]     = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef(null);
  const scoreTimerRef = useRef(null);

  const load = useCallback(() => {
    return getChecklist(change.id).then(r => setChecklist(r.data)).catch(() => setChecklist(null));
  }, [change.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Auto passive-score every 30s during IMPLEMENT phase
  useEffect(() => {
    if (change.status !== 'IMPLEMENT' || !checklist) return;
    const run = () => {
      setScoring(true);
      passiveScore(change.id).then(r => {
        if (r.data.scored > 0) setChecklist(r.data.checklist);
      }).catch(() => {}).finally(() => setScoring(false));
    };
    run(); // run immediately on mount
    scoreTimerRef.current = setInterval(run, 30000);
    return () => clearInterval(scoreTimerRef.current);
  }, [change.status, change.id, !!checklist]);

  const handleGenerate = async (jsonFile) => {
    setError('');
    setGenerating(true);
    try {
      await generateChecklist(change.id, jsonFile || null);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Generation failed');
    } finally { setGenerating(false); }
  };

  const canRederive = change.status === 'NEW' || change.status === 'ASSESS' || change.status === 'DRAFT';
  const isAuthorize = change.status === 'AUTHORIZE';
  const isImplement = change.status === 'IMPLEMENT';
  const stats = checklist?.stats;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(135deg,#7c3aed,#1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Watson.ai Checklist</div>
            {checklist && (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {checklist.generated_by} · {Math.round((checklist.confidence || 0) * 100)}% confidence
                {checklist.accepted_at && <span style={{ color: '#16a34a', marginLeft: 6 }}>· Accepted</span>}
                {scoring && <span style={{ color: '#7c3aed', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Zap size={10} /> Watson scanning…</span>}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Stats pills */}
        {stats && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {stats.accepted  > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#16a34a', background: '#f0fdf4' }}>✓ {stats.accepted}</span>}
            {stats.rejected  > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#dc2626', background: '#fef2f2' }}>✗ {stats.rejected}</span>}
            {stats.modified  > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#d97706', background: '#fff7ed' }}>✎ {stats.modified}</span>}
            {stats.pending   > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#9ca3af', background: '#f9fafb' }}>⏳ {stats.pending}</span>}
            {isImplement && stats.impl_pass > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#7c3aed', background: '#faf5ff' }}><Zap size={9} style={{ verticalAlign: 'middle' }} /> {stats.impl_pass} validated</span>}
            {isImplement && stats.impl_fail > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#dc2626', background: '#fef2f2' }}>⚠ {stats.impl_fail} failed</span>}
            {isImplement && stats.impl_not_run > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#9ca3af', background: '#f9fafb' }}>○ {stats.impl_not_run} pending</span>}
          </div>
        )}

        {/* Derive / locked button */}
        {canRederive ? (
          <button onClick={() => handleGenerate()} disabled={generating}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: generating ? '#e2e8f0' : '#7c3aed', border: 'none', borderRadius: 4, color: generating ? '#94a3b8' : '#fff', fontSize: 12, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {generating ? <Loader size={12} /> : <RefreshCw size={12} />}
            {checklist ? 'Re-derive' : 'Derive from Change'}
          </button>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
            <Lock size={12} /> Locked ({change.status})
          </span>
        )}

        {canRederive && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#1565c0', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={12} /> Upload JSON
            <input type="file" accept=".json" ref={fileRef} style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleGenerate(e.target.files[0]); e.target.value = ''; }} />
          </label>
        )}

        {checklist && (
          <a href={`${api.defaults.baseURL}/watson/changes/${change.id}/export/`} download
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#f0f3f7', border: '1px solid #e2e8f0', borderRadius: 4, color: '#374151', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            <Download size={12} /> Export JSON
          </a>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      {/* Source context */}
      {checklist?.source_notes && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4, padding: '6px 12px', marginBottom: 10, fontSize: 11, color: '#4338ca' }}>
          <Info size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          <strong>Context Watson used:</strong> {checklist.source_notes}
        </div>
      )}

      {/* Phase guidance banner */}
      {isAuthorize && checklist && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Shield size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Authorize phase — review now.</strong> Accept, reject or modify each item. Only accepted items will be active during implementation. Rejected items are excluded.
            Once all items are reviewed, the checklist locks.
          </div>
        </div>
      )}

      {isImplement && checklist && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#14532d', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Zap size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Watson is watching.</strong> As you add work notes, complete tasks, and upload screenshots, Watson reads the activity stream and automatically validates checklist items.
            You don't need to do anything extra — just work normally. The checklist updates every 30 seconds.
          </div>
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading checklist…</div>}

      {!loading && !checklist && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <Cpu size={48} color="#e2e8f0" style={{ marginBottom: 14 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>No checklist yet</div>
          <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 400, margin: '0 auto 16px' }}>
            {canRederive
              ? 'Click "Derive from Change" — Watson will analyse the change, tasks, and CIs to generate a structured checklist.'
              : `Checklist was not generated before the change reached ${change.status}. Contact your CAB manager.`}
          </div>
          {canRederive && (
            <button onClick={() => handleGenerate()} disabled={generating}
              style={{ padding: '8px 20px', background: '#7c3aed', border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {generating ? 'Deriving…' : 'Derive from Change'}
            </button>
          )}

          {/* JSON format hint */}
          <details style={{ marginTop: 24, textAlign: 'left' }}>
            <summary style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>t-rails JSON format reference</summary>
            <pre style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 12, overflow: 'auto', marginTop: 6 }}>{JSON.stringify({
              format: "t-rails-checklist-v1",
              change_number: "CHG1234567",
              groups: [{
                code: "PRE", title: "Pre-Implementation Checks", phase: "PRE-IMPLEMENTATION", group_type: "PRE", task_ref: null,
                items: [{ code: "PRE.a", description: "Confirm backup taken", rationale: "Recovery point", command_hint: "", caution: "" }]
              }, {
                code: "T1", title: "Patch vm-prod-01", phase: "IMPLEMENTATION", group_type: "TASK", task_ref: 42,
                items: [{ code: "T1.a", description: "Apply patches", rationale: "", command_hint: "zypper patch", caution: "Reboot if kernel patched" }]
              }]
            }, null, 2)}</pre>
          </details>
        </div>
      )}

      {/* Tree */}
      {checklist?.groups?.map(group => (
        <GroupBlock key={group.id} group={group} canAccept={isAuthorize} isImplement={isImplement} />
      ))}
    </div>
  );
}
