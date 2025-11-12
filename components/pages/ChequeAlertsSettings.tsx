import React, { useState } from 'react';
import { emailService } from '../../utils/emailService';

const sampleCheque = {
  payer_name: 'TEST PAYER',
  amount: 12345,
  bank: "People's Bank",
  cheque_number: 'TEST-123',
  cheque_date: new Date().toISOString().slice(0,10),
  deposit_date: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().slice(0,10),
  notes: 'Automated test from Cheque Alerts Settings',
  order_id: null,
  collection_id: null,
};

export default function ChequeAlertsSettings() {
  const [recipients, setRecipients] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem('cheque_alert_recipients');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      }
    } catch (e) {
      // ignore
    }
    return ['blithu2015@gmail.com'];
  });

  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const addRecipient = () => {
    const email = (newEmail || '').trim();
    if (!email) return setStatus('Enter an email to add');
    if (recipients.includes(email)) return setStatus('Email already added');
    const updated = [...recipients, email];
    setRecipients(updated);
    try { window.localStorage.setItem('cheque_alert_recipients', JSON.stringify(updated)); } catch (e) { console.warn('Failed to persist recipients', e); }
    setNewEmail('');
    setStatus('Added');
    setTimeout(() => setStatus(null), 1500);
  };

  const removeRecipient = (email: string) => {
    const updated = recipients.filter(e => e !== email);
    setRecipients(updated);
    try { window.localStorage.setItem('cheque_alert_recipients', JSON.stringify(updated)); } catch (e) { console.warn('Failed to persist recipients', e); }
  };

  const saveRecipients = () => {
    try {
      window.localStorage.setItem('cheque_alert_recipients', JSON.stringify(recipients));
      setStatus('Saved');
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      console.error('Failed to save recipients', err);
      setStatus('Save failed');
    }
  };

  const sendTest = async () => {
    setSending(true);
    setStatus('Sending test to recipients...');
    try {
      for (const r of recipients) {
        // eslint-disable-next-line no-await-in-loop
        await emailService.sendChequeDepositToAddress(r, sampleCheque, 'test', { from: 'Shivam2025@gmail.com', message: 'I am lithursan' });
      }
      setStatus('Test sent (check console/notifications)');
    } catch (err) {
      console.error('Test send error', err);
      setStatus('Test failed (see console)');
    }
    setSending(false);
    setTimeout(() => setStatus(null), 3500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Cheque Alert Settings</h2>
      <p className="text-sm text-slate-600 mb-4">Configure the email addresses that receive automated cheque deposit reminders (3-day and 2-day alerts).</p>

      <div className="bg-white dark:bg-slate-800 p-4 rounded shadow-sm">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Add recipient email</label>
        <div className="mt-2 flex gap-2">
          <input
            placeholder="email@example.com"
            className="flex-1 px-3 py-2 border rounded bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addRecipient(); }}
          />
          <button onClick={addRecipient} className="px-3 py-2 bg-blue-600 text-white rounded">Add</button>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Recipients</label>
          <div className="mt-2 space-y-2">
            {recipients.map(r => (
              <div key={r} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-sm truncate">{r}</div>
                <div className="ml-4 flex items-center gap-2">
                  <button onClick={() => { navigator.clipboard?.writeText(r); setStatus('Copied'); setTimeout(() => setStatus(null), 1200); }} className="text-slate-600 hover:text-slate-800">Copy</button>
                  <button onClick={() => removeRecipient(r)} className="text-red-600 hover:text-red-800">Remove</button>
                </div>
              </div>
            ))}
            {recipients.length === 0 && <div className="text-sm text-slate-500">No recipients configured.</div>}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={saveRecipients} className="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
          <button onClick={sendTest} disabled={sending || recipients.length === 0} className="px-3 py-2 bg-emerald-600 text-white rounded">{sending ? 'Sending...' : 'Send test'}</button>
        </div>

        {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}
      </div>

      <div className="mt-6 text-sm text-slate-500">
        <p>Notes:</p>
        <ul className="list-disc ml-5 mt-2">
          <li>Test email is logged to console and will show a browser notification if permissions are granted.</li>
          <li>Recipients are saved in your browser (localStorage). To make this server-wide, we can add a DB-backed settings table for global configuration.</li>
        </ul>
      </div>
    </div>
  );
}
