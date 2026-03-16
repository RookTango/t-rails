import { useState, useEffect, useCallback } from 'react';
import { generateDeepChecklist, getDeepChecklist, passiveScoreDeep } from '../../api/watson';
import {
  Cpu, ChevronDown, ChevronRight, Check, X, AlertTriangle, Terminal,
  Info, Loader, Zap, FlaskConical, Shield, GitCompare, AlertCircle
} from 'lucide-react';

// ── Shared config (mirrors WatsonChecklist) ────────────────────────────────
const IMPL_CFG = {
  NOT_RUN: { color: '#9ca3af', bg: '#f9fafb', label: '—',       icon: null  },
  PASS:    { color: '#16a34a', bg: '#f0fdf4', label: 'Pass',    icon: '✓'   },
  FAIL:    { color: '#dc2626', bg: '#fef2f2', label: 'Fail',    icon: '✗'   },
  CAUTION: { color: '#d97706', bg: '#fff7ed', label: 'Caution', icon: '⚠'   },
  SKIPPED: { color: '#6b7280', bg: '#f9fafb', label: 'Skipped', icon: '⊘'   },
};

const GROUP_TYPE_CFG = {
  PRE:  { color: '#1565c0', label: 'Pre-Implementation'  },
  TASK: { color: '#7c3aed', label: 'Task'                },
  POST: { color: '#16a34a', label: 'Post-Implementation' },
};

const JURY_CFG = {
  AGREE:    { color: '#16a34a', bg: '#f0fdf4', label: 'Agree'    },
  DISAGREE: { color: '#dc2626', bg: '#fef2f2', label: 'Disagree' },
  PARTIAL:  { color: '#d97706', bg: '#fff7ed', label: 'Partial'  },
};

// ── Deep item row — read-only, shows technical_criteria prominently ────────
function DeepItemRow({ item, juryItem }) {
  const [expanded, setExpanded] = useState(false);
  const im = IMPL_CFG[item.impl_result] || IMPL_CFG.NOT_RUN;
  const jury = juryItem ? JURY_CFG[juryItem.agreement] : null;

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '7px 10px',
          background: juryItem?.needs_review ? '#fff7ed' : '#fff',
          border: `1px solid ${juryItem?.needs_review ? '#fde68a' : '#e9ecef'}`,
          borderRadius: expanded ? '4px 4px 0 0' : 4,
          cursor: 'pointer', userSelect: 'none',
        }}>
        <span style={{ color: '#c0c8d4', marginTop: 2, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0369a1', fontWeight: 700, flexShrink: 0, minWidth: 55 }}>
          {item.code}
        </span>
        <span style={{ fontSize: 13, flex: 1, lineHeight: 1.4, color: '#1e293b' }}>
          {item.description}
        </span>

        {item.command_hint && (
          <span title={item.command_hint}
            style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 6px', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Terminal size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            {item.command_hint.split(/\s+/)[0]}…
          </span>
        )}

        {item.caution && <AlertTriangle size={12} color="#d97706" title={item.caution} style={{ flexShrink: 0 }} />}

        {/* Confidence flag */}
        {item.confidence_flag !== 'HIGH' && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, color: '#d97706', background: '#fff7ed', flexShrink: 0 }}>
            {item.confidence_flag}
          </span>
        )}

        {/* Impl result */}
        {item.impl_result !== 'NOT_RUN' && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: im.color, background: im.bg, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            {im.icon} {im.label}
          </span>
        )}

        {/* Jury verdict badge */}
        {jury && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: jury.color, background: jury.bg, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <GitCompare size={9} /> {jury.label}
          </span>
        )}

        {juryItem?.needs_review && (
          <AlertCircle size={13} color="#dc2626" title="Models disagree — human review required" style={{ flexShrink: 0 }} />
        )}
      </div>

      {expanded && (
        <div style={{ background: '#f8fafc', border: '1px solid #e9ecef', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '10px 14px 12px 32px' }}>

          {/* Technical criteria — shown prominently in deep analysis */}
          {item.technical_criteria && (
            <div style={{ marginBottom: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Shield size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Validation Criteria
              </div>
              <div style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.5, fontFamily: 'monospace' }}>
                {item.technical_criteria}
              </div>
            </div>
          )}

          {item.rationale && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Info size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Why Llama included this
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{item.rationale}</div>
            </div>
          )}

          {item.command_hint && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Terminal size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Suggested Command
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#1e293b', color: '#7dd3fc', padding: '7px 10px', borderRadius: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {item.command_hint}
              </div>
            </div>
          )}

          {/* Jury comparison */}
          {juryItem && (
            <div style={{ marginTop: 8, background: juryItem.needs_review ? '#fef2f2' : '#f8fafc', border: `1px solid ${juryItem.needs_review ? '#fecaca' : '#e2e8f0'}`, borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: juryItem.needs_review ? '#dc2626' : '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <GitCompare size={11} />
                {juryItem.needs_review ? 'Model disagreement — human review required' : `Models ${juryItem.agreement.toLowerCase()}`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>Granite 3.3 8B</div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: IMPL_CFG[juryItem.granite_result]?.color || '#9ca3af', background: IMPL_CFG[juryItem.granite_result]?.bg || '#f9fafb' }}>
                    {juryItem.granite_result}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>Llama 3.3 70B</div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color: IMPL_CFG[juryItem.llama_result]?.color || '#9ca3af', background: IMPL_CFG[juryItem.llama_result]?.bg || '#f9fafb' }}>
                    {juryItem.llama_result}
                  </span>
                </div>
              </div>
              {juryItem.llama_note && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>Llama reasoning:</span> {juryItem.llama_note}
                </div>
              )}
            </div>
          )}

          {/* Watson impl result */}
          {item.impl_result !== 'NOT_RUN' && !juryItem && (
            <div style={{ marginTop: 8, background: im.bg, border: `1px solid ${im.color}40`, borderRadius: 4, padding: '6px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: im.color, marginBottom: 2 }}>
                Llama: {im.label}
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{item.impl_watson_note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deep group block ───────────────────────────────────────────────────────
function DeepGroupBlock({ group, juryByCode }) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg   = GROUP_TYPE_CFG[group.group_type] || GROUP_TYPE_CFG.PRE;
  const items = group.items || [];

  const disagreements = items.filter(i => juryByCode[i.code]?.needs_review).length;

  return (
    <div style={{ marginBottom: 14 }}>
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
        {group.task_detail && (
          <span style={{ fontSize: 11, color: '#0369a1', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '1px 8px', flexShrink: 0 }}>
            ⬡ {group.task_detail.task_number}
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}12`, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          {group.phase || cfg.label}
        </span>
        {disagreements > 0 && (
          <span style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '1px 7px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <AlertCircle size={10} /> {disagreements} disagreement{disagreements > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>
          {items.length} items
        </span>
      </div>

      {!collapsed && (
        <div style={{ border: `1px solid ${cfg.color}20`, borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '8px 12px', background: '#fdfdfe' }}>
          {items.length === 0
            ? <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>No items.</div>
            : items.map(item => (
                <DeepItemRow
                  key={item.id}
                  item={item}
                  juryItem={juryByCode[item.code] || null}
                />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Jury summary bar ───────────────────────────────────────────────────────
function JurySummary({ jury, onRunJury, running, isImplement }) {
  if (!jury) {
    return isImplement ? (
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#0369a1' }}>
        <GitCompare size={14} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong>Jury analysis available.</strong> Compare Granite 3.3 and Llama 3.3 verdicts on the same evidence.
          Disagreements are flagged for human review.
        </div>
        <button onClick={onRunJury} disabled={running}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: running ? '#e2e8f0' : '#0369a1', border: 'none', borderRadius: 4, color: running ? '#94a3b8' : '#fff', fontSize: 12, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          {running ? <Loader size={12} /> : <GitCompare size={12} />}
          {running ? 'Running jury…' : 'Run Jury Analysis'}
        </button>
      </div>
    ) : null;
  }

  const verdictColor = jury.summary.verdict === 'AGREE' ? '#16a34a' : jury.summary.verdict === 'DISAGREE' ? '#dc2626' : '#d97706';
  const verdictBg    = jury.summary.verdict === 'AGREE' ? '#f0fdf4' : jury.summary.verdict === 'DISAGREE' ? '#fef2f2' : '#fff7ed';

  return (
    <div style={{ background: verdictBg, border: `1px solid ${verdictColor}40`, borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: jury.needs_human_review ? 8 : 0 }}>
        <GitCompare size={14} color={verdictColor} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: verdictColor }}>
          Jury verdict: {jury.summary.verdict}
          <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
            {jury.summary.agree} agree · {jury.summary.disagree} disagree · {jury.summary.partial} partial
          </span>
        </div>
        <button onClick={onRunJury} disabled={running}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'none', border: `1px solid ${verdictColor}40`, borderRadius: 4, color: verdictColor, fontSize: 11, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {running ? <Loader size={10} /> : <GitCompare size={10} />}
          {running ? 'Re-running…' : 'Re-run'}
        </button>
      </div>
      {jury.needs_human_review && (
        <div style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertCircle size={12} />
          {jury.summary.disagree} item{jury.summary.disagree > 1 ? 's' : ''} where models disagree — expand items below for details.
        </div>
      )}
    </div>
  );
}

// ── Main deep component ────────────────────────────────────────────────────
export function WatsonDeepChecklist({ change }) {
  const [checklist, setChecklist]   = useState(null);
  const [jury, setJury]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [runningJury, setRunningJury] = useState(false);
  const [error, setError]           = useState('');

  const isImplement = change.status === 'IMPLEMENT';

  const load = useCallback(() => {
    return getDeepChecklist(change.id)
      .then(r => setChecklist(r.data))
      .catch(() => setChecklist(null));
  }, [change.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    setJury(null);
    try {
      await generateDeepChecklist(change.id);
      await load();
    } catch (e) {
      const detail = e.response?.data?.detail || e.response?.data?.error || '';
      setError(`Generation failed. ${detail}`);
    } finally { setGenerating(false); }
  };

  const handleJury = async () => {
    setError('');
    setRunningJury(true);
    try {
      const r = await passiveScoreDeep(change.id);
      setJury(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Jury analysis failed.');
    } finally { setRunningJury(false); }
  };

  // Build jury lookup by item code for quick access
  const juryByCode = {};
  if (jury?.jury) {
    jury.jury.forEach(j => { juryByCode[j.item_code] = j; });
  }

  const stats = checklist?.stats;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(135deg,#0369a1,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlaskConical size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Watson Deep Analysis</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {checklist
                ? `${checklist.generated_by} · ${Math.round((checklist.confidence || 0) * 100)}% confidence · Deep Analysis`
                : 'Llama 3.3 70B — richer domain knowledge, detailed criteria'
              }
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        {stats && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {stats.impl_pass > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#16a34a', background: '#f0fdf4' }}>✓ {stats.impl_pass} pass</span>}
            {stats.impl_fail > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#dc2626', background: '#fef2f2' }}>✗ {stats.impl_fail} fail</span>}
            {stats.impl_caution > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#d97706', background: '#fff7ed' }}>⚠ {stats.impl_caution} caution</span>}
            {jury?.summary && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#7c3aed', background: '#faf5ff', display: 'flex', alignItems: 'center', gap: 3 }}>
                <GitCompare size={9} /> {jury.summary.agree}/{jury.jury.length} agree
              </span>
            )}
          </div>
        )}

        {/* Derive button — available at any phase for demo */}
        <button onClick={handleGenerate} disabled={generating}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: generating ? '#e2e8f0' : '#0369a1', border: 'none', borderRadius: 4, color: generating ? '#94a3b8' : '#fff', fontSize: 12, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {generating ? <Loader size={12} /> : <FlaskConical size={12} />}
          {generating ? 'Deriving (Llama 70B)…' : checklist ? 'Re-derive (Llama 70B)' : 'Derive Deep Analysis'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '8px 14px', marginBottom: 12, fontSize: 11, color: '#0369a1', display: 'flex', gap: 8 }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>This is a deep analysis — not the governing checklist.</strong> Generated by Meta Llama 3.3 70B using
          a structural instruction format optimized for enterprise technical depth.
          The standard Watson.ai checklist remains the authoritative document for CAB and implementation.
          Use this for comparison, validation quality assessment, and the jury analysis.
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      {/* Jury summary */}
      {checklist && (
        <JurySummary
          jury={jury}
          onRunJury={handleJury}
          running={runningJury}
          isImplement={isImplement}
        />
      )}

      {/* Source notes */}
      {checklist?.source_notes && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4, padding: '6px 12px', marginBottom: 10, fontSize: 11, color: '#4338ca' }}>
          <Info size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          <strong>Llama Phase 0 reasoning:</strong> {checklist.source_notes}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Loading deep analysis…
        </div>
      )}

      {/* Empty state */}
      {!loading && !checklist && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <FlaskConical size={48} color="#e2e8f0" style={{ marginBottom: 14 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>No deep analysis yet</div>
          <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.6 }}>
            Click <strong>Derive Deep Analysis</strong> to generate a checklist using Meta Llama 3.3 70B.
            Llama's larger knowledge base produces richer technical criteria and more specific command hints.
            Available at any change phase — this is a demo and comparison tool.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
            <span>⚡ Llama 3.3 70B</span>
            <span>·</span>
            <span>🔬 Structural instruction prompts</span>
            <span>·</span>
            <span>⚖️ Jury comparison with Granite</span>
          </div>
          <button onClick={handleGenerate} disabled={generating}
            style={{ padding: '8px 20px', background: '#0369a1', border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {generating ? <Loader size={13} /> : <FlaskConical size={13} />}
            {generating ? 'Deriving…' : 'Derive Deep Analysis'}
          </button>
        </div>
      )}

      {/* Checklist groups */}
      {checklist?.groups?.map(group => (
        <DeepGroupBlock
          key={group.id}
          group={group}
          juryByCode={juryByCode}
        />
      ))}
    </div>
  );
}
