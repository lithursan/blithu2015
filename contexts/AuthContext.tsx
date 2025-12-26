import React, { createContext, useState, useEffect, ReactNode, useCallback, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import { mockUsers } from '../data/mockData';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updatedUser: User) => void;
  refreshAuth: () => Promise<void>;
  isLoading: boolean;
    supabaseStatus?: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [supabaseStatus, setSupabaseStatus] = useState<string | null>(null);

    useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                // First, check Supabase auth session
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                console.log('Supabase session:', session);
                if (sessionError) {
                    console.warn('Supabase getSession error:', sessionError);
                }
                
                // Check localStorage fallback
                const storedUserId = localStorage.getItem('currentUserId');
                console.log('Stored user ID:', storedUserId);
                
                if (storedUserId) {
                    // Fetch user from Supabase users table
                    const { data, error } = await supabase.from('users').select('*').eq('id', storedUserId).single();
                    console.log('User fetch result:', { data, error });
                    // Update supabaseStatus to indicate connectivity (or the error message)
                    if (error) {
                        setSupabaseStatus((error && (error.message || error.details)) ? (error.message || error.details) : String(error));
                    } else {
                        setSupabaseStatus('ok');
                    }
                    
                    if (!error && data) {
                        // Process assignedSupplierNames and assignedRoutes if they are JSON/string
                        const processedUser = {
                            ...data,
                            assignedSupplierNames: (() => {
                                if (!data.assignedsuppliernames) return [];
                                if (typeof data.assignedsuppliernames === 'string') {
                                    try {
                                        const parsed = JSON.parse(data.assignedsuppliernames);
                                        return Array.isArray(parsed) ? parsed : [];
                                    } catch {
                                        return [];
                                    }
                                }
                                return Array.isArray(data.assignedsuppliernames) ? data.assignedsuppliernames : [];
                            })(),
                            assignedRoutes: (() => {
                                if (!data.assignedroutes) return [];
                                if (typeof data.assignedroutes === 'string') {
                                    try {
                                        const parsed = JSON.parse(data.assignedroutes);
                                        return Array.isArray(parsed) ? parsed : [];
                                    } catch {
                                        return [];
                                    }
                                }
                                return Array.isArray(data.assignedroutes) ? data.assignedroutes : [];
                            })()
                        };
                        console.log('Setting current user:', processedUser);
                        setCurrentUser(processedUser);
                    } else {
                        console.warn('User not found or error:', error);
                        // Clean up invalid stored user ID
                        localStorage.removeItem('currentUserId');
                        setCurrentUser(null);
                    }
                } else {
                    console.log('No stored user ID found');
                    setCurrentUser(null);
                    // Even if no stored user, test a lightweight query to assert connectivity
                    try {
                        const { data: usersTest, error: usersTestError } = await supabase.from('users').select('id').limit(1);
                        if (usersTestError) {
                            setSupabaseStatus((usersTestError && (usersTestError.message || usersTestError.details)) ? (usersTestError.message || usersTestError.details) : String(usersTestError));
                        } else {
                            setSupabaseStatus('ok');
                        }
                    } catch (err) {
                        setSupabaseStatus((err && (err as any).message) ? (err as any).message : String(err));
                    }
                }
            } catch (fetchError) {
                console.error('Error fetching current user:', fetchError);
                setCurrentUser(null);
                setSupabaseStatus((fetchError && (fetchError as any).message) ? (fetchError as any).message : String(fetchError));
            } finally {
                setLoading(false);
            }
        };
        
        fetchCurrentUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event, session);
                if (event === 'SIGNED_OUT') {
                    setCurrentUser(null);
                    localStorage.removeItem('currentUserId');
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<void> => {
        try {
            console.log('Attempting login for:', email);
            
            // Query Supabase users table for matching email and password
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', email)
                .eq('password', password)
                .single();
                
            console.log('Login query result:', { data, error });
            
            if (!error && data) {
                // Note: Supabase anonymous auth is disabled, using custom auth system only
                // RLS policies may need to be adjusted or disabled for expenses table
                console.log('Using custom authentication system (Supabase auth session not created)');
                
                // Process assignedSupplierNames and assignedRoutes if they're JSON/string
                const processedUser = {
                    ...data,
                    assignedSupplierNames: (() => {
                        if (!data.assignedsuppliernames) return [];
                        if (typeof data.assignedsuppliernames === 'string') {
                            try {
                                const parsed = JSON.parse(data.assignedsuppliernames);
                                return Array.isArray(parsed) ? parsed : [];
                            } catch {
                                return [];
                            }
                        }
                        return Array.isArray(data.assignedsuppliernames) ? data.assignedsuppliernames : [];
                    })(),
                    assignedRoutes: (() => {
                        if (!data.assignedroutes) return [];
                        if (typeof data.assignedroutes === 'string') {
                            try {
                                const parsed = JSON.parse(data.assignedroutes);
                                return Array.isArray(parsed) ? parsed : [];
                            } catch {
                                return [];
                            }
                        }
                        return Array.isArray(data.assignedroutes) ? data.assignedroutes : [];
                    })()
                };
                
                console.log('Login successful, setting user:', processedUser);
                setCurrentUser(processedUser);
                localStorage.setItem('currentUserId', data.id);
                localStorage.setItem('userLoginTime', Date.now().toString());
                return;
            } else {
                console.error('Login failed:', error);
                // Surface Supabase error message when available to aid debugging (network/CORS/etc.)
                const msg = (error && (error.message || error.details)) ? (error.message || error.details) : 'Invalid email or password.';
                throw new Error(msg);
            }
        } catch (loginError) {
            console.error('Login error:', loginError);
            // Rethrow with original message when possible so the UI can show network/auth details
            const msg = (loginError && (loginError.message || loginError.toString())) ? (loginError.message || loginError.toString()) : 'Login failed. Please try again.';
            throw new Error(msg);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            // Sign out from Supabase to clear the auth session
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.warn('Supabase signout error:', error);
            } else {
                console.log('Supabase session cleared');
            }
        } catch (err) {
            console.warn('Error during Supabase signout:', err);
        }
        
        setCurrentUser(null);
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('supabaseUserId');
        localStorage.removeItem('userLoginTime');
        // The redirect will be handled by the ProtectedRoute component
    }, []);

    const updateCurrentUser = useCallback((updatedUser: User) => {
        setCurrentUser(updatedUser);
        // Also update the mock data source in a real scenario, or have a central state management
    }, []);

    const refreshAuth = useCallback(async () => {
        setLoading(true);
        try {
            const storedUserId = localStorage.getItem('currentUserId');
            if (storedUserId) {
                const { data, error } = await supabase.from('users').select('*').eq('id', storedUserId).single();
                if (!error && data) {
                    const processedUser = {
                        ...data,
                        assignedSupplierNames: (() => {
                            if (!data.assignedsuppliernames) return [];
                            if (typeof data.assignedsuppliernames === 'string') {
                                try {
                                    const parsed = JSON.parse(data.assignedsuppliernames);
                                    return Array.isArray(parsed) ? parsed : [];
                                } catch {
                                    return [];
                                }
                            }
                            return Array.isArray(data.assignedsuppliernames) ? data.assignedsuppliernames : [];
                        })(),
                        assignedRoutes: (() => {
                            if (!data.assignedroutes) return [];
                            if (typeof data.assignedroutes === 'string') {
                                try {
                                    const parsed = JSON.parse(data.assignedroutes);
                                    return Array.isArray(parsed) ? parsed : [];
                                } catch {
                                    return [];
                                }
                            }
                            return Array.isArray(data.assignedroutes) ? data.assignedroutes : [];
                        })()
                    };
                    setCurrentUser(processedUser);
                    console.log('Auth refreshed successfully');
                } else {
                    console.warn('Auth refresh failed, clearing session');
                    localStorage.removeItem('currentUserId');
                    setCurrentUser(null);
                }
            } else {
                setCurrentUser(null);
            }
        } catch (error) {
            console.error('Auth refresh error:', error);
            setCurrentUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const value = { currentUser, login, logout, updateCurrentUser, refreshAuth, isLoading: loading };
    // Expose supabaseStatus in the context for UI debugging
    const valueWithStatus = { ...value, supabaseStatus };
    // Don't render children until the initial auth state has been determined
    // to prevent flashing of content.
    return (
        <AuthContext.Provider value={valueWithStatus}>
            {!loading && children}
        </AuthContext.Provider>
    );
};