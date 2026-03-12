import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { login } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await login(form);
      signIn(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || 'Invalid credentials. Try: john.doe / password123');
    } finally { setLoading(false); }
  };

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #c0c8d4', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#00b388', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Layers size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a2332', marginBottom: 4 }}>ChangeMgr</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Watson.ai Powered Change Management</p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #d0d5dd', borderRadius: 6, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          {error && <div style={{ background: '#fdedec', border: '1px solid #f5c6c2', borderRadius: 3, padding: '8px 12px', marginBottom: 14, color: '#c0392b', fontSize: 13 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Username</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#1565c0'} onBlur={e => e.target.style.borderColor = '#c0c8d4'} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm({...form, password: e.target.value})} style={{ ...inputStyle, paddingRight: 36 }}
                  onFocus={e => e.target.style.borderColor = '#1565c0'} onBlur={e => e.target.style.borderColor = '#c0c8d4'} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>
                  {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '9px', background: '#00b388', border: 'none', borderRadius: 3, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <span style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : 'Sign In'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>Demo: john.doe / password123</p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
