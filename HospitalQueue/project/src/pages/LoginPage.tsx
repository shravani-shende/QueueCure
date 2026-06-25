import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Cross, Eye, EyeOff, AlertTriangle, Loader2, Shield, Stethoscope } from 'lucide-react';

interface Props {
  mode: 'receptionist' | 'admin';
}

export default function LoginPage({ mode }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }

    setLoading(true);
    const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
    if (signInError) {
      setError('Invalid credentials. Please try again.');
    }
    setLoading(false);
  }

  const isAdmin = mode === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Hospital branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <Cross className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">City Care Hospital</h1>
          <p className="text-slate-500 text-sm mt-1">Queue Management System</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
          {/* Role badge */}
          <div className={`flex items-center gap-2 mb-6 pb-5 border-b border-slate-100`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-slate-800' : 'bg-blue-100'}`}>
              {isAdmin ? <Shield className="w-5 h-5 text-white" /> : <Stethoscope className="w-5 h-5 text-blue-600" />}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">{isAdmin ? 'Hospital Administrator' : 'Receptionist Login'}</p>
              <p className="text-xs text-slate-500">{isAdmin ? 'Full access — manage doctors & staff' : 'Manage patient queue'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm ${isAdmin ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-60`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          {isAdmin
            ? 'Access restricted to hospital administrators only'
            : 'Receptionist accounts are created by the hospital administrator'}
        </p>

        <div className="text-center mt-4">
          <a href="/" className="text-blue-600 hover:underline text-xs">← Back to Patient Portal</a>
        </div>
      </div>
    </div>
  );
}
