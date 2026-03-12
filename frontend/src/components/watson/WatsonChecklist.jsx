import { useState, useEffect } from 'react';
import { Cpu, CheckCircle2, XCircle, Clock, Sparkles, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { generateChecklist, evaluateImplementation, getChecklists, approveChecklist } from '../../api/watson';
import { useAuth } from '../../context/AuthContext';

const RESULT_CFG = {
  PENDING: { icon: Clock,         color: '#b45309', bg: '#fef3c7', label: 'Pending'  },
  PASS:    { icon: CheckCircle2,  color: '#27ae60', bg: '#eafaf1', label: 'Pass'     },
  FAIL:    { icon: XCircle,       color: '#c0392b', bg: '#fdedec', label: 'Fail'     },
  NA:      { icon: Clock,         color: '#6b7280', bg: '#f3f4f6', label: 'N/A'      },
};

function ChecklistItem({ item }) {
  const [exp, setExp] = useState(false);
  const cfg = RESULT_CFG[item.result] || RESULT_CFG.PENDING;
  const Icon = cfg.icon;
  return (
    <div style={{ border: '1px solid var(--sn-border-light)', borderRadius: 3, marginBottom: 6 }}>
      <div onClick={() => setExp(!exp)} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: '#fafbfc' }}>
        <Icon size={14} color={cfg.color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 3, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
        <span style={{ fontSize: 11, color: 'var(--sn-text-muted)', flexShrink: 0 }}>{item.category}</span>
        {exp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>
      {exp && (
        <div style={{ padding: '10px 12px 12px 36px', borderTop: '1px solid var(--sn-border-light)', background: '#fff' }}>
          {item.rationale && <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sn-text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Watson Rationale</div>
            <div style={{ fontSize: 13, color: 'var(--sn-text-secondary)', lineHeight: 1.5 }}>{item.rationale}</div>
          </div>}
          {item.evidence_note && <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sn-text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Evidence</div>
            <div style={{ fontSize: 13, color: 'var(--sn-text-secondary)', lineHeight: 1.5, padding: '6px 10px', borderLeft: `3px solid ${cfg.color}`, background: cfg.bg, borderRadius: '0 3px 3px 0' }}>{item.evidence_note}</div>
          </div>}
        </div>
      )}
    </div>
  );
}

export function WatsonChecklist({ change }) {
  const [checklists, setChecklists] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const { user } = useAuth();

  const load = () => getChecklists(change.id).then(r => setChecklists(r.data)).catch(() => {});
  useEffect(() => { load(); }, [change.id]);

  const cl = checklists.find(c => c.phase === 'AUTHORIZE');
  const pass = cl?.items?.filter(i => i.result === 'PASS').length || 0;
  const fail = cl?.items?.filter(i => i.result === 'FAIL').length || 0;
  const total = cl?.items?.length || 0;

  const btnStyle = (color) => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: color, border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <div>
      <div style={{ padding: '10px 14px', background: 'linear-gradient(135deg, #1a237e08, #4a148c08)', borderBottom: '1px solid var(--sn-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 4, background: '#1565c0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Watson.ai Analysis</div>
            <div style={{ fontSize: 11, color: 'var(--sn-text-muted)' }}>Intelligent change governance</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {change.status === 'AUTHORIZE' && (
            <button onClick={async () => { setGenerating(true); try { await generateChecklist(change.id, 'AUTHORIZE'); load(); } finally { setGenerating(false); } }} disabled={generating} style={btnStyle('#1565c0')}>
              <Sparkles size={12} /> {generating ? 'Analyzing...' : 'Generate Checklist'}
            </button>
          )}
          {change.status === 'IMPLEMENT' && cl && (
            <button onClick={async () => { setEvaluating(true); try { await evaluateImplementation(change.id); load(); } finally { setEvaluating(false); } }} disabled={evaluating} style={btnStyle('#d35400')}>
              <Cpu size={12} /> {evaluating ? 'Evaluating...' : 'Evaluate Implementation'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {!cl ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--sn-text-muted)', fontSize: 13 }}>
            <Cpu size={28} style={{ opacity: 0.2, marginBottom: 8, display: 'block', margin: '0 auto 10px' }} />
            Move to Authorize phase to generate a Watson.ai checklist
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              {[['Total', total, '#1565c0'], ['Pass', pass, '#27ae60'], ['Fail', fail, '#c0392b'], ['Pending', total - pass - fail, '#b45309']].map(([l,v,c]) => (
                <div key={l} style={{ padding: '4px 12px', border: `1px solid ${c}30`, borderRadius: 3, background: `${c}08` }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</span>
                  <span style={{ fontSize: 11, color: 'var(--sn-text-muted)', marginLeft: 6 }}>{l}</span>
                </div>
              ))}
              {cl.approved_by && (
                <div style={{ padding: '4px 12px', border: '1px solid #27ae6040', borderRadius: 3, background: '#eafaf1', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShieldCheck size={13} color="#27ae60" />
                  <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 600 }}>CAB Approved</span>
                </div>
              )}
            </div>

            {cl.items?.map(item => <ChecklistItem key={item.id} item={item} />)}

            {!cl.approved_by && user?.is_cab && change.status === 'AUTHORIZE' && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#e8f0fe', border: '1px solid #1565c040', borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>CAB Authorization Required</div>
                  <div style={{ fontSize: 12, color: 'var(--sn-text-muted)' }}>Review and approve to proceed</div>
                </div>
                <button onClick={async () => { await approveChecklist(cl.id); load(); }} style={btnStyle('#27ae60')}>
                  <ShieldCheck size={12} /> Approve
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
