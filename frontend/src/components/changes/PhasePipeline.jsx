import { STATUS_ORDER, STATUS_CONFIG } from '../../utils/statusConfig';
import { Check } from 'lucide-react';

export function PhasePipeline({ currentStatus }) {
  const phases = STATUS_ORDER.filter(s => s !== 'CANCELLED');
  const currentIdx = phases.indexOf(currentStatus);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: '#fff', borderBottom: '1px solid var(--sn-border)', overflowX: 'auto' }}>
      {phases.map((phase, idx) => {
        const isDone   = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isLast   = idx === phases.length - 1;
        const isFirst  = idx === 0;

        let bg        = '#f0f2f4';
        let color     = '#6b7280';
        let fontWeight = 400;
        if (isActive) { bg = '#2e7d32'; color = '#fff'; fontWeight = 700; }
        else if (isDone) { bg = '#e8f5e9'; color = '#388e3c'; fontWeight = 500; }

        // Arrow: right point always, left notch on all except first
        const clipPath = (() => {
          if (isFirst && isLast)  return 'none';
          if (isFirst)            return 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)';
          if (isLast)             return 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)';
          return 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)';
        })();

        return (
          <div key={phase} style={{ flex: 1, minWidth: 95, position: 'relative' }}>
            <div style={{
              width: '100%', height: 38, background: bg, color, fontWeight,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontSize: 12, position: 'relative',
              clipPath,
              // Overlap so chevrons nest properly
              marginLeft: idx > 0 ? -6 : 0,
              paddingLeft: idx > 0 ? 18 : 10,
              paddingRight: isLast ? 10 : 18,
              transition: 'background 0.2s',
              zIndex: phases.length - idx,
            }}>
              {isDone && <Check size={11} strokeWidth={3} />}
              <span style={{ whiteSpace: 'nowrap' }}>{STATUS_CONFIG[phase].label}</span>
            </div>
          </div>
        );
      })}

      {currentStatus === 'CANCELLED' && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', background: '#fdedec', color: '#c0392b', fontSize: 12, fontWeight: 700, gap: 5, flexShrink: 0 }}>
          ✕ Cancelled
        </div>
      )}
    </div>
  );
}
