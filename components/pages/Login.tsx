import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('manoj.d@shivamdist.com'); // Default for easy login
    const [password, setPassword] = useState('adminpassword123'); // Default for easy login
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, currentUser } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || "Failed to log in.");
        }
    };

    // If user is already logged in, redirect to dashboard
    if (currentUser) {
        return <Navigate to="/" />;
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg dark:bg-slate-800">
                <div className="text-center">
                    <div className="flex flex-col items-center">
                        {/* Modern Company Logo */}
                        <div className="relative mb-4">
                            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg">
                                <div className="flex items-center justify-center w-12 h-12 bg-white rounded-xl">
                                    <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
                                        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="white"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        
                        {/* Company Name with Proper Spacing */}
                        <div className="mb-2">
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-wide">
                                SHIVAM
                            </h1>
                            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 tracking-widest">
                                DISTRIBUTORS (PVT) LTD
                            </div>
                        </div>
                    </div>
                    <p className="mt-4 text-slate-500 dark:text-slate-400">Welcome back! Please log in to your account.</p>
                    {/* Show Supabase connectivity status (if present) for debugging */}
                    {(useAuth() as any).supabaseStatus && (
                        <div className="mt-3 p-3 text-sm text-amber-800 bg-amber-100 rounded-lg dark:bg-amber-900 dark:text-amber-200" role="status">
                            <strong>Supabase status:</strong> {(useAuth() as any).supabaseStatus}
                        </div>
                    )}
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-300" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="space-y-4 rounded-md shadow-sm">
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email address</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="relative block w-full px-3 py-3 text-slate-900 placeholder-slate-500 border border-slate-300 rounded-lg appearance-none bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Email address"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="password-login" className="sr-only">Password</label>
                            <input
                                id="password-login"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="relative block w-full px-3 py-3 text-slate-900 placeholder-slate-500 border border-slate-300 rounded-lg appearance-none bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Password"
                            />
                             <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 z-20 flex items-center px-4 text-slate-500 dark:text-slate-400"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                        <path d="M2 4.272l4.586 4.586a1 1 0 01-1.414 1.414l-4.586-4.586A1 1 0 012 4.272z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="relative flex justify-center w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg group hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Log In
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};