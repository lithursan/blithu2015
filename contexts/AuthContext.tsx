import React, { createContext, useState, useEffect, ReactNode, useCallback, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import { mockUsers } from '../data/mockData';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updatedUser: User) => void;
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
            const storedUserId = localStorage.getItem('currentUserId');
            if (storedUserId) {
                // Fetch user from Supabase
                const { data, error } = await supabase.from('users').select('*').eq('id', storedUserId).single();
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
                    setCurrentUser(processedUser);
                } else {
                    setCurrentUser(null);
                }
            }
            setLoading(false);
        };
        fetchCurrentUser();
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<void> => {
        // Query Supabase users table for matching email and password
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();
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
            setCurrentUser(processedUser);
            localStorage.setItem('currentUserId', data.id);
            return;
        } else {
            throw new Error("Invalid email or password.");
        }
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        localStorage.removeItem('currentUserId');
        // The redirect will be handled by the ProtectedRoute component
    }, []);

    const updateCurrentUser = useCallback((updatedUser: User) => {
        setCurrentUser(updatedUser);
        // Also update the mock data source in a real scenario, or have a central state management
    }, []);


    const value = { currentUser, login, logout, updateCurrentUser };

    // Don't render children until the initial auth state has been determined
    // to prevent flashing of content.
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};