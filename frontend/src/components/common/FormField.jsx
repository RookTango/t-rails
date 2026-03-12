export function FormField({ label, required, children, col = 1 }) {
  return (
    <div style={{ display: 'contents' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px 5px 0', minHeight: 30 }}>
        <label style={{ fontSize: 13, color: 'var(--sn-text-label)', fontWeight: 400, whiteSpace: 'nowrap' }}>
          {required && <span style={{ color: 'var(--sn-red)', marginRight: 2 }}>*</span>}
          {label}
        </label>
      </div>
      <div style={{ padding: '3px 0', display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

const baseInput = {
  width: '100%', padding: '4px 8px', border: '1px solid #c0c8d4',
  borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  background: '#fff', color: 'var(--sn-text-primary)', height: 28,
};

export function TextInput({ value, onChange, placeholder, disabled, style }) {
  return (
    <input value={value || ''} onChange={onChange} placeholder={placeholder} disabled={disabled}
      style={{ ...baseInput, background: disabled ? '#f7f8fa' : '#fff', ...style }}
      onFocus={e => !disabled && (e.target.style.borderColor = '#1565c0')}
      onBlur={e => (e.target.style.borderColor = '#c0c8d4')} />
  );
}

export function SelectInput({ value, onChange, options, disabled }) {
  return (
    <select value={value || ''} onChange={onChange} disabled={disabled}
      style={{ ...baseInput, cursor: disabled ? 'default' : 'pointer', appearance: 'auto', background: disabled ? '#f7f8fa' : '#fff' }}
      onFocus={e => !disabled && (e.target.style.borderColor = '#1565c0')}
      onBlur={e => (e.target.style.borderColor = '#c0c8d4')}>
      {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
  );
}

export function TextArea({ value, onChange, rows = 3, placeholder, disabled }) {
  return (
    <textarea value={value || ''} onChange={onChange} rows={rows} placeholder={placeholder} disabled={disabled}
      style={{ ...baseInput, height: 'auto', resize: 'vertical', padding: '5px 8px', lineHeight: 1.4, background: disabled ? '#f7f8fa' : '#fff' }}
      onFocus={e => !disabled && (e.target.style.borderColor = '#1565c0')}
      onBlur={e => (e.target.style.borderColor = '#c0c8d4')} />
  );
}

export function DateTimeInput({ value, onChange, disabled }) {
  const formatted = value ? value.slice(0, 16) : '';
  return (
    <input type="datetime-local" value={formatted} onChange={e => onChange(e.target.value + ':00')} disabled={disabled}
      style={{ ...baseInput, background: disabled ? '#f7f8fa' : '#fff' }}
      onFocus={e => !disabled && (e.target.style.borderColor = '#1565c0')}
      onBlur={e => (e.target.style.borderColor = '#c0c8d4')} />
  );
}
