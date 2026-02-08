import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import type { LoginProvider } from '../lib/api';
import { isBiometricAvailable } from '../lib/auth';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, biometricLogin } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState<LoginProvider>("ldap");
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Optional: Clear auth on mount if we want to force login every time user hits /
  useEffect(() => {
    const rafId = requestAnimationFrame(() => setMounted(true));
    void isBiometricAvailable().then(setBiometricAvailable);
    return () => cancelAnimationFrame(rafId);
    // Check if we are already logged in to prevent showing login page unnecessarily
    // if the user navigated here manually but has a session.
    // However, for "Default Page" behavior requested, we often want to show login.
    // Let's leave it so user sees login if they go to /.
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(identifier, password, provider);
      navigate('/dashboard');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineAccess = () => {
    navigate('/offline');
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await biometricLogin();
      navigate('/dashboard');
    } catch {
      setError('Biometric login unavailable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100svh] bg-slate-50 dark:bg-slate-900 flex flex-col font-display overflow-hidden">
      {/* Header Section with Image */}
      <div className="relative w-full h-[30svh] shrink-0">
        <div className="absolute inset-0 bg-slate-900">
           <img 
            src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=2670&auto=format&fit=crop" 
            alt="Factory" 
            className={`w-full h-full object-cover transition-opacity duration-700 ${mounted ? 'opacity-60' : 'opacity-0'}`}
           />
           <div className={`absolute inset-0 bg-gradient-to-b from-primary/40 via-transparent to-transparent transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}></div>
        </div>

        {/* Logo and Title Content */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center pb-4 z-10 text-center transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
          <div className="w-20 h-20 bg-primary/20 backdrop-blur-md rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/30 mb-3 border border-white/10">
            <span className="material-symbols-outlined text-white text-[40px]">precision_manufacturing</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">PM Tech</h1>
          <p className="text-blue-100 font-medium text-xs mt-1 tracking-wide drop-shadow-sm">Preventive Maintenance Simplified</p>
        </div>
      </div>

      {/* Form Section - Card Layout */}
      <div className={`flex-1 bg-white dark:bg-slate-900 rounded-t-[32px] px-6 pt-6 -mt-8 z-20 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] flex flex-col transition-all duration-700 ease-out delay-75 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        <form onSubmit={handleLogin} className="space-y-5">
          
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Email / Employee ID</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors">badge</span>
              </div>
              <input 
                type="text" 
                placeholder="Enter your email or ID"
                className="block w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors">lock</span>
              </div>
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="Enter your password"
                className="block w-full pl-11 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility' : 'visibility_off'}</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end -mt-1">
            <button type="button" className="text-primary text-sm font-bold hover:text-primary/80 transition-colors">Forgot Password?</button>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl shadow-lg shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-primary/40"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined">login</span>
                  Sign In
                </>
              )}
            </button>
            <button 
              type="button" 
              onClick={handleBiometricLogin}
              disabled={loading || !biometricAvailable}
              className="w-[80px] rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-0.5 active:bg-slate-50 dark:active:bg-slate-800 transition-colors hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 text-[28px]">fingerprint</span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Biometric</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-2">
            <button type="button" onClick={() => setProvider('ldap')} className={`col-span-6 py-2.5 rounded-xl border ${provider === 'ldap' ? 'bg-primary text-white border-primary' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>LDAP</button>
            <button type="button" onClick={() => setProvider('local')} className={`col-span-6 py-2.5 rounded-xl border ${provider === 'local' ? 'bg-primary text-white border-primary' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>Local</button>
          </div>

          {error ? <p className="mt-2 text-red-600 text-sm font-bold">{error}</p> : null}

        </form>

        <div className="relative py-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-white dark:bg-slate-900 text-slate-400 uppercase tracking-widest font-bold">OR</span>
          </div>
        </div>

        <button 
          onClick={handleOfflineAccess}
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-full flex items-center justify-center gap-3 active:bg-slate-50 dark:active:bg-slate-700 transition-all hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">offline_bolt</span>
          Offline Mode Access
        </button>
        <p className="text-center text-slate-400 dark:text-slate-500 text-[11px] mt-3 px-4 leading-relaxed">
          Use offline mode to access cached assets and work orders when network connectivity is unavailable.
        </p>

        {/* Footer System Status */}
        <div className="mt-6 mb-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-full border border-green-100 dark:border-green-900/30 shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-bold text-green-700 dark:text-green-400 tracking-wide">SYSTEM ONLINE</span>
          </div>
          <p className="text-[10px] text-slate-300 dark:text-slate-600 font-bold tracking-[0.15em] uppercase">
            © 2024 PM Tech Systems. v4.2.0-PRODUCTION
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
