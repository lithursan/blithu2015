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

    useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                // First, check Supabase auth session
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                console.log('Supabase session:', session);
                
                // Check localStorage fallback
                const storedUserId = localStorage.getItem('currentUserId');
                console.log('Stored user ID:', storedUserId);
                
                if (storedUserId) {
                    // Fetch user from Supabase users table
                    const { data, error } = await supabase.from('users').select('*').eq('id', storedUserId).single();
                    console.log('User fetch result:', { data, error });
                    
                    if (!error && data) {
                        // Process assignedSupplierNames if it's a JSON string
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
                }
            } catch (fetchError) {
                console.error('Error fetching current user:', fetchError);
                setCurrentUser(null);
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
                
                // Process assignedSupplierNames if it's a JSON string
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
                    })()
                };
                
                console.log('Login successful, setting user:', processedUser);
                setCurrentUser(processedUser);
                localStorage.setItem('currentUserId', data.id);
                localStorage.setItem('userLoginTime', Date.now().toString());
                return;
            } else {
                console.error('Login failed:', error);
                throw new Error("Invalid email or password.");
            }
        } catch (loginError) {
            console.error('Login error:', loginError);
            throw new Error("Login failed. Please try again.");
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

    // Don't render children until the initial auth state has been determined
    // to prevent flashing of content.
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};