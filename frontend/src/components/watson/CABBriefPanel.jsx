import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import {
  Shield, X, Printer, Loader, AlertTriangle, AlertCircle,
  CheckCircle2, ChevronDown, ChevronRight, Send, RefreshCw,
  FileText, Zap, Lock, Info, ClipboardList
} from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────
const SEVERITY_CFG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '🔴' },
  HIGH:     { color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '🟠' },
  MEDIUM:   { color: '#ca8a04', bg: '#fefce8', border: '#fef08a', dot: '🟡' },
};

const STATUS_CFG = {
  OPEN:      { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Awaiting Response'  },
  JUSTIFIED: { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', label: 'Evaluating'         },
  SATISFIED: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Satisfied'           },
  ESCALATED: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Escalated'           },
};

const RISK_CFG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', label: 'CRITICAL RISK',  icon: '🔴' },
  HIGH:     { color: '#d97706', bg: '#fffbeb', label: 'HIGH RISK',      icon: '🟠' },
  MEDIUM:   { color: '#ca8a04', bg: '#fefce8', label: 'MEDIUM RISK',    icon: '🟡' },
  LOW:      { color: '#16a34a', bg: '#f0fdf4', label: 'LOW RISK',       icon: '🟢' },
};

const SOURCE_LABELS = {
  TASK:     '📋 Task',
  RUNBOOK:  '📄 Runbook',
  BACKOUT:  '↩️ Backout Plan',
  SCHEDULE: '🕐 Schedule',
  SCOPE:    '🔍 Scope',
  CI:       '🖥️ CI',
  GENERAL:  '⚠️ General',
};

// ── Single challenge card ──────────────────────────────────────────────────
function ChallengeCard({ challenge, onEvaluated }) {
  const [expanded, setExpanded]     = useState(challenge.status === 'OPEN' || challenge.status === 'ESCALATED');
  const [justification, setJust]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const sev    = SEVERITY_CFG[challenge.severity] || SEVERITY_CFG.MEDIUM;
  const status = STATUS_CFG[challenge.status]     || STATUS_CFG.OPEN;
  const isResolved = challenge.status === 'SATISFIED';
  const isEscalated = challenge.status === 'ESCALATED';
  const canSubmit = challenge.status === 'OPEN' || challenge.status === 'ESCALATED';

  const handleSubmit = async () => {
    if (!justification.trim() || justification.trim().length < 20) {
      setError('Provide a specific response — minimum 20 characters with named evidence.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const r = await api.post(`/watson/cab-challenges/${challenge.id}/evaluate/`, {
        justification: justification.trim(),
      });
      onEvaluated(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Evaluation failed. Try again.');
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{
      border: `1px solid ${isResolved ? '#bbf7d0' : isEscalated ? '#fecaca' : sev.border}`,
      borderLeft: `4px solid ${isResolved ? '#16a34a' : isEscalated ? '#dc2626' : sev.color}`,
      borderRadius: 6,
      marginBottom: 10,
      overflow: 'hidden',
      opacity: isResolved ? 0.85 : 1,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px',
          background: isResolved ? '#f0fdf4' : isEscalated ? '#fef2f2' : sev.bg,
          cursor: 'pointer', userSelect: 'none',
        }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{sev.dot}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: sev.color, background: `${sev.color}15`, padding: '1px 7px', borderRadius: 10 }}>
              {challenge.severity}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {SOURCE_LABELS[challenge.source_type] || challenge.source_type}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed' }}>
              {challenge.source_ref}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: status.color, background: status.bg, padding: '1px 8px', borderRadius: 10, border: `1px solid ${status.border}` }}>
              {isResolved ? '✓ Satisfied' : isEscalated ? '✗ Escalated' : status.label}
            </span>
            {challenge.resubmit_count > 0 && (
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                attempt {challenge.resubmit_count}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5, fontWeight: isResolved ? 400 : 500 }}>
            {challenge.finding}
          </div>
        </div>
        <span style={{ color: '#c0c8d4', flexShrink: 0, marginTop: 2 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px 14px', background: '#fff', borderTop: `1px solid ${sev.border}` }}>

          {/* Acceptance criteria */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ClipboardList size={11} /> What is required to satisfy this challenge
            </div>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '10px 12px', fontSize: 12, color: '#0c4a6e', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {challenge.acceptance_criteria}
            </div>
          </div>

          {/* Watson resolution note — shown after evaluation */}
          {challenge.resolution_note && (
            <div style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 4,
              background: isResolved ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${isResolved ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isResolved ? '#15803d' : '#dc2626', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Zap size={11} />
                Watson evaluation: {isResolved ? 'SATISFIED' : 'ESCALATED'}
              </div>
              <div style={{ fontSize: 12, color: isResolved ? '#14532d' : '#7f1d1d', lineHeight: 1.6 }}>
                {challenge.resolution_note}
              </div>
              {challenge.resolved_by && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                  Submitted by {challenge.resolved_by} · {challenge.resolved_at ? new Date(challenge.resolved_at).toLocaleString() : ''}
                </div>
              )}
            </div>
          )}

          {/* Previous justification shown on escalation */}
          {isEscalated && challenge.justification && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 3 }}>Previous response (insufficient)</div>
              <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{challenge.justification}"
              </div>
            </div>
          )}

          {/* Justification input */}
          {canSubmit && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                {isEscalated ? 'Provide additional evidence (previous response was insufficient):' : 'Provide justification addressing ALL criteria above:'}
              </div>
              {error && (
                <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 6, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                  <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
                </div>
              )}
              <textarea
                value={justification}
                onChange={e => setJust(e.target.value)}
                placeholder="Be specific — name the tool, command, estimated time, and responsible person. Vague responses will be rejected."
                rows={4}
                style={{
                  width: '100%', padding: '8px 10px',
                  border: '1px solid #e2e8f0', borderRadius: 4,
                  fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  background: '#fafafa',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !justification.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 16px',
                    background: submitting || !justification.trim() ? '#e2e8f0' : '#0f172a',
                    border: 'none', borderRadius: 4,
                    color: submitting || !justification.trim() ? '#94a3b8' : '#fff',
                    fontSize: 13, fontWeight: 600,
                    cursor: submitting || !justification.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                  {submitting ? <Loader size={13} /> : <Send size={13} />}
                  {submitting ? 'Watson evaluating…' : 'Submit for evaluation'}
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Watson will evaluate against each criterion above
                </span>
              </div>
            </div>
          )}

          {/* Linked checklist item */}
          {challenge.linked_item_code && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Zap size={10} />
              Linked to checklist item <strong>{challenge.linked_item_code}</strong>
              {isResolved && ' — criteria updated with accepted justification'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ stats }) {
  if (!stats || stats.total === 0) return null;
  const pct = Math.round((stats.resolved / stats.total) * 100);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
        <span>{stats.resolved} of {stats.total} challenges resolved</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: stats.escalated > 0 ? '#dc2626' : '#16a34a', borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
        {stats.open > 0      && <span style={{ color: '#64748b' }}>○ {stats.open} open</span>}
        {stats.satisfied > 0 && <span style={{ color: '#16a34a' }}>✓ {stats.satisfied} satisfied</span>}
        {stats.escalated > 0 && <span style={{ color: '#dc2626' }}>✗ {stats.escalated} escalated</span>}
      </div>
    </div>
  );
}

// ── Final brief renderer ───────────────────────────────────────────────────
function FinalBrief({ brief, outcome, stats, onClose }) {
  const lines    = (brief || '').split('\n');
  const outcomeColor = outcome?.includes('ESCALATED') ? '#dc2626' : outcome?.includes('CONDITIONS') ? '#d97706' : '#16a34a';

  return (
    <div>
      <div style={{ background: '#0f172a', borderRadius: 6, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${outcomeColor}25`, border: `2px solid ${outcomeColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {outcome?.includes('ESCALATED') ? <AlertCircle size={18} color={outcomeColor} /> : <CheckCircle2 size={18} color={outcomeColor} />}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: outcomeColor, letterSpacing: '0.05em' }}>{outcome}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {stats.satisfied} satisfied · {stats.escalated} escalated · {stats.total} total challenges
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.8, color: '#1e293b' }}>
        {lines.map((line, i) => {
          const h2 = line.match(/^##\s+(.+)/);
          if (h2) return (
            <div key={i} style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 18, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h2[1]}
            </div>
          );
          if (line.startsWith('✓')) return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#14532d', fontSize: 12 }}>
              <CheckCircle2 size={13} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{line.replace('✓ ', '')}</span>
            </div>
          );
          if (line.startsWith('✗')) return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#7f1d1d', fontSize: 12 }}>
              <AlertCircle size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{line.replace('✗ ', '')}</span>
            </div>
          );
          if (line.startsWith('-')) return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12, color: '#374151' }}>
              <span style={{ color: '#7c3aed', flexShrink: 0 }}>•</span>
              <span>{line.replace(/^-\s*/, '')}</span>
            </div>
          );
          if (line.startsWith('*') && line.endsWith('*')) return (
            <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
              {line.replace(/\*/g, '')}
            </div>
          );
          if (line.trim()) return (
            <div key={i} style={{ marginBottom: 4, fontSize: 12, color: '#475569' }}>{line}</div>
          );
          return <div key={i} style={{ height: 6 }} />;
        })}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function CABBriefPanel({ change, onClose }) {
  const [state, setState]           = useState('idle');   // idle | generating | board | finalising | done
  const [overallRisk, setRisk]      = useState(null);
  const [riskJustification, setRJ]  = useState('');
  const [challenges, setChallenges] = useState([]);
  const [stats, setStats]           = useState(null);
  const [finalBrief, setFinalBrief] = useState(null);
  const [finalOutcome, setFinalOutcome] = useState(null);
  const [error, setError]           = useState('');

  // Load existing challenges on mount
  useEffect(() => {
    api.get(`/watson/changes/${change.id}/cab-challenges/`)
      .then(r => {
        if (r.data.challenges?.length > 0) {
          setChallenges(r.data.challenges);
          setStats(r.data.stats);
          setState('board');
        }
      })
      .catch(() => {});
  }, [change.id]);

  const handleGenerate = async () => {
    setState('generating');
    setError('');
    try {
      const r = await api.post(`/watson/changes/${change.id}/cab-interrogate/`);
      setRisk(r.data.overall_risk);
      setRJ(r.data.risk_justification);
      setChallenges(r.data.challenges);
      setStats({
        total:     r.data.challenge_count,
        open:      r.data.challenge_count,
        justified: 0,
        satisfied: 0,
        escalated: 0,
        resolved:  0,
      });
      setState('board');
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.detail || 'Generation failed.');
      setState('idle');
    }
  };

  const handleEvaluated = useCallback((result) => {
    // Update the challenge in state
    setChallenges(prev => prev.map(c =>
      c.id === result.challenge.id ? result.challenge : c
    ));
    // Refresh stats
    api.get(`/watson/changes/${change.id}/cab-challenges/`)
      .then(r => setStats(r.data.stats))
      .catch(() => {});
  }, [change.id]);

  const handleFinalBrief = async () => {
    setState('finalising');
    setError('');
    try {
      const r = await api.post(`/watson/changes/${change.id}/cab-final-brief/`);
      setFinalBrief(r.data.brief);
      setFinalOutcome(r.data.outcome);
      setStats(r.data.stats);
      setState('done');
    } catch (e) {
      setError(e.response?.data?.error || 'Final brief generation failed.');
      setState('board');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const riskCfg = RISK_CFG[overallRisk] || RISK_CFG.HIGH;
  const allResolved = stats && stats.total > 0 && stats.resolved === stats.total;
  const hasEscalated = stats && stats.escalated > 0;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 999, backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 720, maxWidth: '96vw',
        background: '#fff', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 48px rgba(0,0,0,0.2)',
        animation: 'slideInRight 0.25s ease',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', background: '#0f172a', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#1e40af,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>CAB Interrogation Protocol</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {change.ticket_number} · {change.short_description?.slice(0, 52)}{change.short_description?.length > 52 ? '…' : ''}
            </div>
          </div>
          <div style={{ flex: 1 }} />

          {/* State indicator */}
          {state === 'board' && stats && (
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
              <div>{stats.resolved}/{stats.total} resolved</div>
              {overallRisk && (
                <div style={{ color: riskCfg.color, fontWeight: 700 }}>{riskCfg.icon} {riskCfg.label}</div>
              )}
            </div>
          )}

          {state === 'done' && (
            <button onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 5, color: '#e2e8f0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Printer size={12} /> Print
            </button>
          )}

          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* ── IDLE — generate prompt ── */}
          {state === 'idle' && (
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Shield size={52} color="#e2e8f0" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                CAB Interrogation Protocol
              </div>
              <div style={{ fontSize: 13, color: '#64748b', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.7 }}>
                Watson analyses the change and generates specific risk challenges.
                Each challenge must be answered with named evidence before CAB can approve.
              </div>
              {[
                { icon: <AlertTriangle size={13} color="#d97706" />, text: 'Detects undisclosed systems in runbook vs declared CI list' },
                { icon: <ClipboardList size={13} color="#7c3aed" />, text: 'Each challenge has specific acceptance criteria to satisfy' },
                { icon: <Zap size={13} color="#0369a1" />,           text: 'Watson evaluates each response and accepts or escalates' },
                { icon: <FileText size={13} color="#16a34a" />,      text: 'Accepted justifications strengthen the implementation checklist' },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6, textAlign: 'left', fontSize: 12, color: '#374151' }}>
                  {f.icon} {f.text}
                </div>
              ))}
              {error && (
                <div style={{ marginTop: 16, fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 12px' }}>
                  {error}
                </div>
              )}
              <button onClick={handleGenerate}
                style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#0f172a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Shield size={15} /> Begin Interrogation
              </button>
            </div>
          )}

          {/* ── GENERATING ── */}
          {state === 'generating' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Loader size={40} color="#7c3aed" style={{ marginBottom: 18, animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Generating challenges…</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                Watson is analysing the change scope, runbook, tasks, and backout plan.<br />
                Comparing declared CIs against attachment content for anomalies.
              </div>
            </div>
          )}

          {/* ── BOARD — challenge cards ── */}
          {state === 'board' && (
            <>
              {/* Risk banner */}
              {overallRisk && (
                <div style={{ background: riskCfg.bg, border: `1px solid ${riskCfg.color}40`, borderLeft: `4px solid ${riskCfg.color}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{riskCfg.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: riskCfg.color }}>{riskCfg.label}</div>
                    {riskJustification && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{riskJustification}</div>
                    )}
                  </div>
                  <button onClick={handleGenerate}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'none', border: `1px solid ${riskCfg.color}40`, borderRadius: 4, color: riskCfg.color, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    <RefreshCw size={10} /> Re-run
                  </button>
                </div>
              )}

              <ProgressBar stats={stats} />

              {/* All-resolved banner */}
              {allResolved && !hasEscalated && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#14532d' }}>
                  <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>All challenges satisfied. Generate the final brief to complete CAB due diligence.</div>
                  <button onClick={handleFinalBrief}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: '#16a34a', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    <FileText size={12} /> Generate Final Brief
                  </button>
                </div>
              )}

              {allResolved && hasEscalated && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#7f1d1d' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {stats.escalated} challenge{stats.escalated > 1 ? 's' : ''} escalated. Generate final brief to escalate to Senior CAB.
                  </div>
                  <button onClick={handleFinalBrief}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: '#dc2626', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    <FileText size={12} /> Generate Final Brief
                  </button>
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
                  {error}
                </div>
              )}

              {/* Challenge cards */}
              {challenges.map(c => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  onEvaluated={handleEvaluated}
                />
              ))}

              {/* Generate brief even if not all resolved */}
              {!allResolved && stats && stats.resolved > 0 && (
                <div style={{ textAlign: 'center', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={handleFinalBrief}
                    style={{ fontSize: 12, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FileText size={11} /> Generate interim brief with current state
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── FINALISING ── */}
          {state === 'finalising' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Loader size={40} color="#7c3aed" style={{ marginBottom: 18, animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Generating final brief…</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Summarising the interrogation record</div>
            </div>
          )}

          {/* ── DONE — final brief ── */}
          {state === 'done' && finalBrief && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setState('board')}
                  style={{ fontSize: 12, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ← Back to challenges
                </button>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>CAB Final Brief</div>
              </div>
              <FinalBrief
                brief={finalBrief}
                outcome={finalOutcome}
                stats={stats}
              />
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media print {
          body * { visibility: hidden; }
          #cab-brief-print, #cab-brief-print * { visibility: visible; }
          #cab-brief-print { position: fixed; top: 0; left: 0; width: 100%; background: white; padding: 24px; }
        }
      `}</style>
    </>
  );
}
