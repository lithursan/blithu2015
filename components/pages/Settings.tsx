import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { User, UserSettings } from '../../types';
import { Switch } from '../ui/Switch';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { emailService } from '../../utils/emailService';

type SettingsTab = 'profile' | 'preferences' | 'notifications' | 'account';

export const Settings: React.FC = () => {
  const { currentUser, updateCurrentUser, logout } = useAuth();
  const { users, setUsers } = useData();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profileData, setProfileData] = useState({ name: '', email: '', avatarUrl: '', phone: '' });
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [preferencesData, setPreferencesData] = useState<Pick<UserSettings, 'language' | 'currency'>>({ language: 'en', currency: 'LKR' });
  const [notificationsData, setNotificationsData] = useState<UserSettings['notifications']>({ newOrders: false, lowStockAlerts: false });

  useEffect(() => {
    if (currentUser) {
      (async () => {
        try {
          // Always fetch latest user from Supabase
          const { data: userRows } = await supabase.from('users').select('*').eq('id', currentUser.id);
          let avatarUrl = userRows && userRows[0] && userRows[0].avatarurl ? userRows[0].avatarurl : currentUser.avatarUrl;
          if (!avatarUrl || avatarUrl === '' || avatarUrl === undefined || avatarUrl === null) {
            avatarUrl = `https://i.pravatar.cc/150?u=${currentUser.email || 'user'}`;
          }
          setProfileData({
            name: currentUser.name,
            email: currentUser.email,
            avatarUrl,
            phone: currentUser.phone || '',
          });
          setPreferencesData({
            language: currentUser.settings.language,
            currency: currentUser.settings.currency,
          });
          setNotificationsData(currentUser.settings.notifications);
        } catch (err) {
          console.error('Settings.tsx: Error setting user data', err);
        }
      })();
    } else {
      console.warn('Settings.tsx: currentUser is null or undefined');
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="p-8 text-center">
        <p>Loading user settings...</p>
      </div>
    );
  }

  const handleProfileSave = () => {
    const updatedUser: User = {
      ...currentUser,
      ...profileData
    };
    // Update Supabase users table (snake_case columns)
    (async () => {
      const dbUpdate: any = {};
      if (profileData.name !== undefined) dbUpdate.name = profileData.name;
      if (profileData.email !== undefined) dbUpdate.email = profileData.email;
      if (profileData.avatarUrl !== undefined) dbUpdate.avatarurl = profileData.avatarUrl;
      if (profileData.phone !== undefined) dbUpdate.phone = profileData.phone;
      await supabase.from('users').update(dbUpdate).eq('id', updatedUser.id);
    })();
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    updateCurrentUser(updatedUser);
    alert('Profile updated successfully!');
  };

  const handlePasswordChange = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    if (passwordData.newPassword.length < 8) {
        alert("Password must be at least 8 characters long.");
        return;
    }

    const updatedUser: User = {
      ...currentUser,
      password: passwordData.newPassword,
    };
    // Update Supabase users table (snake_case column)
    (async () => {
      await supabase.from('users').update({ password: passwordData.newPassword }).eq('id', updatedUser.id);
    })();
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    updateCurrentUser(updatedUser);
    setPasswordData({ newPassword: '', confirmPassword: ''});
    alert('Password changed successfully!');
  };
  
  const handlePreferencesSave = () => {
    const updatedUser: User = {
        ...currentUser,
        settings: {
            ...currentUser.settings,
            ...preferencesData,
        }
    };
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    updateCurrentUser(updatedUser);
    alert('Preferences saved successfully!');
  };

  const handleNotificationsSave = async () => {
      // Request browser notification permission if any notifications are enabled
      if (notificationsData.newOrders || notificationsData.lowStockAlerts) {
        await emailService.requestNotificationPermission();
      }
      
      const updatedUser: User = {
        ...currentUser,
        settings: {
            ...currentUser.settings,
            notifications: notificationsData,
        }
    };
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    updateCurrentUser(updatedUser);
    alert('Notification settings saved! You will receive email and browser notifications based on your preferences.');
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setProfileData(prev => ({ ...prev, avatarUrl: base64String }));
      // Save avatar to Supabase users table
      if (currentUser) {
        (async () => {
          await supabase.from('users').update({ avatarurl: base64String }).eq('id', currentUser.id);
        })();
      }
    };
    reader.readAsDataURL(file);
  }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      logout();
      navigate('/login');
    }
  };

  const TabButton: React.FC<{tab: SettingsTab; label: string}> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        activeTab === tab 
          ? 'bg-blue-600 text-white' 
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
      
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        <TabButton tab="profile" label="Profile" />
        <TabButton tab="preferences" label="Preferences" />
        <TabButton tab="notifications" label="Notifications" />
        <TabButton tab="account" label="Account" />
      </div>

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1">
                 <CardHeader>
                    <CardTitle>Profile Picture</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-4">
           {profileData.avatarUrl ? (
            <img 
              src={profileData.avatarUrl} 
              alt="User Avatar" 
              className="w-32 h-32 rounded-full object-cover border-4 border-slate-200 dark:border-slate-600"
            />
           ) : (
            <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 text-4xl">
              <span>?</span>
            </div>
           )}
                     <label htmlFor="avatar-upload-settings" className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        Upload new photo
                        <input 
                            id="avatar-upload-settings" 
                            type="file" 
                            className="hidden" 
                            accept="image/png, image/jpeg, image/gif"
                            onChange={handleAvatarChange}
                        />
                    </label>
                </CardContent>
            </Card>
            <div className="lg:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Personal Information</CardTitle>
                        <CardDescription>Update your name, email, and phone number.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div>
                            <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Full Name</label>
                            <input type="text" id="name" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                         <div>
                            <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email Address</label>
                            <input type="email" id="email" value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div>
                            <label htmlFor="phone" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Phone</label>
                            <input type="tel" id="phone" value={profileData.phone} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div className="flex justify-end">
                            <button onClick={handleProfileSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Profile</button>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Change Password</CardTitle>
                        <CardDescription>Enter a new password below.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label htmlFor="newPassword" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">New Password</label>
                            <input type="password" id="newPassword" value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                         <div>
                            <label htmlFor="confirmPassword" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Confirm New Password</label>
                            <input type="password" id="confirmPassword" value={passwordData.confirmPassword} onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div className="flex justify-end">
                            <button onClick={handlePasswordChange} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Change Password</button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      )}

      {activeTab === 'preferences' && (
        <Card>
          <CardHeader>
            <CardTitle>User Preferences</CardTitle>
            <CardDescription>Set your language and currency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div>
                <label htmlFor="language" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Language</label>
                <select id="language" value={preferencesData.language} onChange={e => setPreferencesData({...preferencesData, language: e.target.value as UserSettings['language']})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="hi">Hindi</option>
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Language setting is for demonstration and does not currently change the UI.</p>
            </div>
             <div>
                <label htmlFor="currency" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Currency</label>
                <select id="currency" value={preferencesData.currency} onChange={e => setPreferencesData({...preferencesData, currency: e.target.value as UserSettings['currency']})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="LKR">Sri Lankan Rupee (LKR)</option>
                    <option value="USD">United States Dollar (USD)</option>
                    <option value="INR">Indian Rupee (INR)</option>
                </select>
            </div>
             <div className="flex justify-end pt-4">
                <button onClick={handlePreferencesSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Preferences</button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Manage how you receive notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Email notifications will be sent to:</strong> {currentUser.email}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                You can update your email address in the Profile tab.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div>
                    <p className="font-medium text-slate-900 dark:text-white">New Order Emails</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Receive an email for every new order placed.</p>
                </div>
                <Switch 
                    checked={notificationsData.newOrders}
                    onChange={checked => setNotificationsData({...notificationsData, newOrders: checked})}
                    ariaLabel="Toggle new order email notifications"
                />
            </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div>
                    <p className="font-medium text-slate-900 dark:text-white">Low Stock Alerts</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Get notified when product stock is running low.</p>
                </div>
                <Switch 
                    checked={notificationsData.lowStockAlerts}
                    onChange={checked => setNotificationsData({...notificationsData, lowStockAlerts: checked})}
                    ariaLabel="Toggle low stock alert notifications"
                />
            </div>
            <div className="flex justify-end pt-4">
                <button onClick={handleNotificationsSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Notifications</button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'account' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>View your account details and manage your session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">User ID</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{currentUser.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Role</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{currentUser.role}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{currentUser.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{currentUser.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
              <CardDescription>Actions that cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-red-800 dark:text-red-300 font-medium">Log Out</h4>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      This will sign you out of your current session and redirect you to the login page.
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
};