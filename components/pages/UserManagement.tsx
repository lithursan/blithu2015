import React, { useState, useMemo } from 'react';
import { User, UserRole, UserStatus } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';
import { exportUsers } from '../../utils/exportUtils';

const getStatusBadgeVariant = (status: UserStatus): 'success' | 'danger' => {
    return status === UserStatus.Active ? 'success' : 'danger';
};

export const UserManagement: React.FC = () => {
    // Helper functions for Supabase CRUD
    const addUserToDB = async (user: User) => {
        // Map to snake_case for DB
        const dbUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status,
            avatarurl: user.avatarUrl,
            lastlogin: user.lastLogin,
            password: user.password,
            assignedsuppliernames: user.assignedSupplierNames,
            settings: user.settings,
        };
        await supabase.from('users').insert([dbUser]);
    };
    const updateUserInDB = async (id: string, newData: Partial<User>) => {
    // Map to snake_case for DB
    const dbUpdate: any = {};
    if (newData.name !== undefined) dbUpdate.name = newData.name;
    if (newData.email !== undefined) dbUpdate.email = newData.email;
    if (newData.phone !== undefined) dbUpdate.phone = newData.phone;
    if (newData.role !== undefined) dbUpdate.role = newData.role;
    if (newData.status !== undefined) dbUpdate.status = newData.status;
    if (newData.avatarUrl !== undefined) dbUpdate.avatarurl = newData.avatarUrl;
    if (newData.lastLogin !== undefined) dbUpdate.lastlogin = newData.lastLogin;
    if (newData.password !== undefined) dbUpdate.password = newData.password;
    if (newData.assignedSupplierNames !== undefined) dbUpdate.assignedsuppliernames = newData.assignedSupplierNames;
    if (newData.settings !== undefined) dbUpdate.settings = newData.settings;
    await supabase.from('users').update(dbUpdate).eq('id', id);
    };
    const deleteUserFromDB = async (id: string) => {
        await supabase.from('users').delete().eq('id', id);
    };
    const { currentUser: loggedInUser } = useAuth();
    const { users, setUsers, suppliers } = useData();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [currentUser, setCurrentUser] = useState<Partial<User>>({});
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [visiblePasswordUserId, setVisiblePasswordUserId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
   
    if (loggedInUser?.role !== UserRole.Admin) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 text-center">
                 <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="text-red-500">Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600 dark:text-slate-400">You do not have permission to view this page.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const openModal = (mode: 'add' | 'edit', user?: User) => {
        setModalMode(mode);
        // For edit mode, don't pre-fill password for security.
        const userForModal = user 
            ? { ...user, password: '' } 
            : { name: '', email: '', phone: '', role: UserRole.Sales, status: UserStatus.Active, password: '', avatarUrl: '', assignedSupplierNames: [] };
        setCurrentUser(userForModal);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentUser({});
        setShowPassword(false);
    };

    const openDeleteConfirm = (user: User) => {
        setUserToDelete(user);
    };

    const closeDeleteConfirm = () => {
        setUserToDelete(null);
    };

    const handleSave = async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
            if (modalMode === 'add') {
                // Check for unique email/phone
                const { data: existingUsers, error: fetchError } = await supabase
                    .from('users')
                    .select('id, email, phone');
                if (fetchError) throw fetchError;
                const emailExists = existingUsers.some((u: any) => u.email === currentUser.email);
                const phoneExists = currentUser.phone && existingUsers.some((u: any) => u.phone === currentUser.phone);
                if (emailExists) {
                    setSaveError('This email is already used by another user.');
                    setIsSaving(false);
                    return;
                }
                if (phoneExists) {
                    setSaveError('This phone number is already used by another user.');
                    setIsSaving(false);
                    return;
                }
                // Generate unique ID using timestamp and random number
                const uniqueId = `USER${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
                const newUser: User = {
                    id: uniqueId,
                    name: currentUser.name || 'New User',
                    email: currentUser.email || '',
                    phone: currentUser.phone || '',
                    role: currentUser.role || UserRole.Sales,
                    status: UserStatus.Active,
                    avatarUrl: currentUser.avatarUrl || `https://i.pravatar.cc/40?u=${currentUser.email || 'new'}`,
                    lastLogin: new Date().toISOString(),
                    password: currentUser.password,
                    assignedSupplierNames: currentUser.role === UserRole.Sales ? currentUser.assignedSupplierNames || [] : [],
                    settings: {
                        language: 'en',
                        currency: 'LKR',
                        notifications: { newOrders: true, lowStockAlerts: false },
                    },
                };
                await addUserToDB(newUser);
            } else {
                const { password, ...restOfCurrentUser } = currentUser;
                const updatedUser: Partial<User> = { ...restOfCurrentUser };
                if (password) {
                    updatedUser.password = password;
                }
                if (updatedUser.role !== UserRole.Sales) {
                    updatedUser.assignedSupplierNames = [];
                }
                // For edit, check if email/phone is being changed to a duplicate
                const { data: existingUsers, error: fetchError } = await supabase
                    .from('users')
                    .select('id, email, phone');
                if (fetchError) throw fetchError;
                const emailExists = existingUsers.some((u: any) => u.email === currentUser.email && u.id !== currentUser.id);
                const phoneExists = currentUser.phone && existingUsers.some((u: any) => u.phone === currentUser.phone && u.id !== currentUser.id);
                if (emailExists) {
                    setSaveError('This email is already used by another user.');
                    setIsSaving(false);
                    return;
                }
                if (phoneExists) {
                    setSaveError('This phone number is already used by another user.');
                    setIsSaving(false);
                    return;
                }
                await updateUserInDB(currentUser.id as string, updatedUser);
            }
            // Fetch fresh users and map
            const { data } = await supabase.from('users').select('*');
            if (data) {
                const mappedUsers = data.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    role: row.role,
                    status: row.status,
                    avatarUrl: row.avatarurl ?? '',
                    lastLogin: row.lastlogin,
                    password: row.password,
                    assignedSupplierNames: row.assignedsuppliernames ?? [],
                    settings: row.settings ?? {},
                }));
                setUsers(mappedUsers);
            }
            closeModal();
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save user.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (userToDelete) {
            await deleteUserFromDB(userToDelete.id);
            // Fetch fresh users and map
            const { data } = await supabase.from('users').select('*');
            if (data) {
                const mappedUsers = data.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    role: row.role,
                    status: row.status,
                    avatarUrl: row.avatarurl ?? '',
                    lastLogin: row.lastlogin,
                    password: row.password,
                    assignedSupplierNames: row.assignedsuppliernames ?? [],
                    settings: row.settings ?? {},
                }));
                setUsers(mappedUsers);
            }
            closeDeleteConfirm();
        }
    };
    
    const handleInputChange = (field: keyof User, value: any) => {
        setCurrentUser(prev => ({ ...prev, [field]: value }));
    };

    const handleSupplierAssignmentChange = (supplierName: string) => {
        const currentAssigned = currentUser.assignedSupplierNames || [];
        const isAssigned = currentAssigned.includes(supplierName);
        const newAssigned = isAssigned
            ? currentAssigned.filter(name => name !== supplierName)
            : [...currentAssigned, supplierName];
        handleInputChange('assignedSupplierNames', newAssigned);
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                handleInputChange('avatarUrl', base64String);
            };
            // FIX: Corrected typo from readDataURL to readAsDataURL.
            reader.readAsDataURL(file);
        }
    };

    const toggleStatus = (user: User) => {
    const newStatus = user.status === UserStatus.Active ? UserStatus.Inactive : UserStatus.Active;
    setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    updateUserInDB(user.id, { status: newStatus });
    };

    const filteredUsers = useMemo(() =>
        users.filter(user =>
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        ),
        [users, searchTerm]
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">User Management</h1>
                <div className="flex gap-2">
                    {/* Export Buttons */}
                    <button
                        onClick={() => exportUsers(filteredUsers, 'csv')}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        title="Export as CSV"
                    >
                        📊 CSV
                    </button>
                    <button
                        onClick={() => exportUsers(filteredUsers, 'xlsx')}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        title="Export as Excel"
                    >
                        📋 Excel
                    </button>
                    <button onClick={() => openModal('add')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        Add User
                    </button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>View, edit, and manage user accounts.</CardDescription>
                    <div className="pt-4">
                        <input
                            type="text"
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full max-w-sm px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                <tr>
                                    <th scope="col" className="px-6 py-3">User</th>
                                    <th scope="col" className="px-6 py-3">Contact</th>
                                    <th scope="col" className="px-6 py-3">Role & Assignments</th>
                                    <th scope="col" className="px-6 py-3">Password</th>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                    <th scope="col" className="px-6 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center">
                                            <div className="flex flex-col items-center space-y-2">
                                                <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                                </svg>
                                                <p className="text-slate-500 dark:text-slate-400 font-medium">
                                                    {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
                                                </p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                                    Total users: {users.length} | Filtered: {filteredUsers.length}
                                                </p>
                                                {!searchTerm && (
                                                    <button
                                                        onClick={() => openModal('add')}
                                                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                                    >
                                                        Add First User
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <tr key={user.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                                <div className="flex items-center space-x-3">
                                                    <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full" />
                                                    <span>{user.name}</span>
                                                </div>
                                            </td>
                                        <td className="px-6 py-4">
                                            <div>{user.email}</div>
                                            <div className="text-xs text-slate-500">{user.phone || 'No phone'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-semibold">{user.role}</p>
                                            {user.role === UserRole.Sales && user.assignedSupplierNames && user.assignedSupplierNames.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1 max-w-xs">
                                                    {user.assignedSupplierNames.map(name => <Badge key={name}>{name}</Badge>)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono">
                                            <div className="flex items-center space-x-2">
                                                <span>
                                                    {visiblePasswordUserId === user.id ? user.password : '••••••••'}
                                                </span>
                                                <button
                                                    onClick={() => setVisiblePasswordUserId(visiblePasswordUserId === user.id ? null : user.id)}
                                                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                                    title={visiblePasswordUserId === user.id ? "Hide password" : "Show password"}
                                                    aria-label={visiblePasswordUserId === user.id ? "Hide password" : "Show password"}
                                                >
                                                    {visiblePasswordUserId === user.id ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /><path d="M2 4.272l4.586 4.586a1 1 0 01-1.414 1.414l-4.586-4.586A1 1 0 012 4.272z" /></svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button onClick={() => toggleStatus(user)} className="cursor-pointer" title={`Click to change status`}>
                                                <Badge variant={getStatusBadgeVariant(user.status)}>{user.status}</Badge>
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 flex items-center space-x-2">
                                            <button onClick={() => openModal('edit', user)} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                                            <button onClick={() => openDeleteConfirm(user)} className="font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                                        </td>
                                    </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New User' : 'Edit User'}>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="flex flex-col items-center space-y-2">
                        <img 
                            src={currentUser.avatarUrl || 'https://i.pravatar.cc/100?u=default'} 
                            alt="Avatar preview" 
                            className="w-24 h-24 rounded-full object-cover border-4 border-slate-200 dark:border-slate-600"
                        />
                        <label htmlFor="avatar-upload" className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                            Upload Photo
                            <input 
                                id="avatar-upload" 
                                type="file" 
                                className="hidden" 
                                accept="image/png, image/jpeg, image/gif"
                                onChange={handleAvatarChange}
                            />
                        </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Full Name</label>
                            <input type="text" id="name" value={currentUser.name || ''} onChange={e => handleInputChange('name', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                        </div>
                        <div>
                            <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email Address</label>
                            <input type="email" id="email" value={currentUser.email || ''} onChange={e => handleInputChange('email', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                        </div>
                        <div>
                            <label htmlFor="phone" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Phone</label>
                            <input type="tel" id="phone" value={currentUser.phone || ''} onChange={e => handleInputChange('phone', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div>
                            <label htmlFor="role" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Role</label>
                            <select
                                id="role"
                                value={currentUser.role || UserRole.Sales}
                                onChange={e => handleInputChange('role', e.target.value as UserRole)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            >
                                {Object.values(UserRole).map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="password" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Password</label>
                             <div className="relative">
                                <input 
                                    type={showPassword ? 'text' : 'password'} 
                                    id="password" 
                                    value={currentUser.password || ''} 
                                    onChange={e => handleInputChange('password', e.target.value)} 
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                                    placeholder={modalMode === 'edit' ? 'Leave blank to keep unchanged' : ''}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 px-3 flex items-center text-sm text-slate-500 dark:text-slate-400"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /><path d="M2 4.272l4.586 4.586a1 1 0 01-1.414 1.414l-4.586-4.586A1 1 0 012 4.272z" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {currentUser.role === UserRole.Sales && (
                        <div className="pt-4 border-t dark:border-slate-700">
                            <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Assign Suppliers</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {suppliers.map(supplier => (
                                    <div key={supplier.id} className="flex items-center p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                                        <input
                                            type="checkbox"
                                            id={`supplier-${supplier.id}`}
                                            checked={(currentUser.assignedSupplierNames || []).includes(supplier.name)}
                                            onChange={() => handleSupplierAssignmentChange(supplier.name)}
                                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label htmlFor={`supplier-${supplier.id}`} className="ml-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">{supplier.name}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {saveError && (
                    <div className="text-red-600 text-sm mb-2 text-center">{saveError}</div>
                )}
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600" disabled={isSaving}>
                        Cancel
                    </button>
                    <button onClick={handleSave} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-60" disabled={isSaving}>
                        {isSaving ? (modalMode === 'add' ? 'Saving...' : 'Saving...') : (modalMode === 'add' ? 'Save User' : 'Save Changes')}
                    </button>
                </div>
            </Modal>

            <Modal isOpen={!!userToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
                <div className="p-6">
                    <p className="text-slate-600 dark:text-slate-300">Are you sure you want to delete the user "{userToDelete?.name}"?</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This action cannot be undone.</p>
                </div>
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={closeDeleteConfirm} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                        Cancel
                    </button>
                    <button onClick={handleDelete} type="button" className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700">
                        Delete
                    </button>
                </div>
            </Modal>
        </div>
    );
};