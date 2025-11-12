import { User, Order, Product } from '../types';

// Email service utility for notifications
export class EmailService {
  private static instance: EmailService;
  
  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  // Send new order notification email
  async sendNewOrderNotification(user: User, order: Order, customerName: string): Promise<boolean> {
    if (!user.settings.notifications.newOrders) {
      return false; // User has disabled new order notifications
    }

    try {
      // In a real application, you would integrate with an email service like:
      // - SendGrid
      // - AWS SES
      // - Nodemailer with SMTP
      // - Supabase Edge Functions with email service
      
      const emailData = {
        to: user.email,
        subject: `New Order Received - ${order.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Order Notification</h2>
            <p>Hello ${user.name},</p>
            <p>A new order has been placed and assigned to you:</p>
            
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Order Details</h3>
              <p><strong>Order ID:</strong> ${order.id}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Total Amount:</strong> LKR ${order.total.toLocaleString()}</p>
              <p><strong>Status:</strong> ${order.status}</p>
              <p><strong>Date:</strong> ${new Date(order.date).toLocaleDateString()}</p>
            </div>
            
            <p>Please log in to the system to view the full order details and process accordingly.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 12px;">
                This is an automated notification from SHIVAM DISTRIBUTORS (PVT) LTD.<br>
                You can manage your notification preferences in Settings.
              </p>
            </div>
          </div>
        `
      };

      // Simulate email sending (replace with actual email service)
      console.log('📧 NEW ORDER EMAIL NOTIFICATION:', emailData);
      
      // In development, show browser notification instead
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`New Order: ${order.id}`, {
            body: `Order from ${customerName} - LKR ${order.total.toLocaleString()}`,
            icon: '/favicon.ico'
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send new order notification:', error);
      return false;
    }
  }

  // Send low stock alert email
  async sendLowStockAlert(user: User, product: Product): Promise<boolean> {
    if (!user.settings.notifications.lowStockAlerts) {
      return false; // User has disabled low stock alerts
    }

    try {
      const emailData = {
        to: user.email,
        subject: `Low Stock Alert - ${product.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Low Stock Alert</h2>
            <p>Hello ${user.name},</p>
            <p>The following product is running low on stock:</p>
            
            <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <h3 style="margin-top: 0; color: #dc2626;">Product Details</h3>
              <p><strong>Product Name:</strong> ${product.name}</p>
              <p><strong>SKU:</strong> ${product.sku}</p>
              <p><strong>Category:</strong> ${product.category}</p>
              <p><strong>Current Stock:</strong> ${product.stock} units</p>
              <p><strong>Supplier:</strong> ${product.supplier}</p>
            </div>
            
            <p>Please consider restocking this item to avoid stockouts.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 12px;">
                This is an automated notification from SHIVAM DISTRIBUTORS (PVT) LTD.<br>
                You can manage your notification preferences in Settings.
              </p>
            </div>
          </div>
        `
      };

      // Simulate email sending (replace with actual email service)
      console.log('📧 LOW STOCK EMAIL ALERT:', emailData);
      
      // In development, show browser notification instead
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`Low Stock: ${product.name}`, {
            body: `Only ${product.stock} units remaining`,
            icon: '/favicon.ico'
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send low stock alert:', error);
      return false;
    }
  }

  // Send cheque deposit reminder (e.g., 3 days before deposit date)
  async sendChequeDepositAlert(user: User, cheque: any): Promise<boolean> {
    try {
      const emailData = {
        to: user.email,
        subject: `Cheque Deposit Reminder - ${cheque.cheque_number || cheque.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Upcoming Cheque Deposit</h2>
            <p>Hello ${user.name},</p>
            <p>This is a reminder that a cheque is scheduled for deposit soon:</p>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Payer:</strong> ${cheque.payer_name || '-'} </p>
              <p><strong>Amount:</strong> LKR ${cheque.amount?.toLocaleString?.() ?? cheque.amount}</p>
              <p><strong>Bank:</strong> ${cheque.bank || '-'}</p>
              <p><strong>Cheque #:</strong> ${cheque.cheque_number || '-'}</p>
              <p><strong>Deposit Date:</strong> ${cheque.deposit_date ? new Date(cheque.deposit_date).toLocaleDateString() : '-'}</p>
            </div>
            <p>Please ensure funds are available and proceed with the deposit.</p>
          </div>
        `
      };

      console.log('📧 CHEQUE DEPOSIT REMINDER EMAIL:', emailData);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`Cheque deposit due: LKR ${cheque.amount}`, {
            body: `${cheque.payer_name || '-'} — Deposit on ${cheque.deposit_date ? new Date(cheque.deposit_date).toLocaleDateString() : 'N/A'}`,
            icon: '/favicon.ico'
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to send cheque deposit reminder:', error);
      return false;
    }
  }

  // Send cheque deposit reminder to an explicit email address (used for automated alerts)
  async sendChequeDepositToAddress(recipientEmail: string, cheque: any, stageLabel?: string, options?: { from?: string; message?: string }): Promise<boolean> {
    try {
      const subject = `Cheque Deposit Reminder - ${cheque.cheque_number || cheque.id} ${stageLabel ? `(${stageLabel})` : ''}`;
      const fromAddr = options?.from || 'Shivam2025@gmail.com';
      const customMessage = options?.message;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <h2 style="color:#2563eb;">Upcoming Cheque Deposit</h2>
          <p>This is an automated reminder for an incoming cheque scheduled for deposit.</p>
          ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
          <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:12px 0;">
            <p><strong>Payer:</strong> ${cheque.payer_name || '-'}</p>
            <p><strong>Amount:</strong> LKR ${cheque.amount?.toLocaleString?.() ?? cheque.amount}</p>
            <p><strong>Bank:</strong> ${cheque.bank || '-'}</p>
            <p><strong>Cheque #:</strong> ${cheque.cheque_number || '-'}</p>
            <p><strong>Cheque Date:</strong> ${cheque.cheque_date ? new Date(cheque.cheque_date).toLocaleDateString() : '-'}</p>
            <p><strong>Deposit Date:</strong> ${cheque.deposit_date ? new Date(cheque.deposit_date).toLocaleDateString() : '-'}</p>
            <p><strong>Notes:</strong> ${cheque.notes || '-'}</p>
            <p><strong>Linked Order ID:</strong> ${cheque.order_id || '-'}</p>
            <p><strong>Linked Collection ID:</strong> ${cheque.collection_id || '-'}</p>
          </div>
          <p>Please make sure funds are available and proceed with the deposit on the scheduled day.</p>
          <div style="margin-top:18px;color:#64748b;font-size:12px;">Automated notification from SHIVAM DISTRIBUTORS (PVT) LTD.</div>
        </div>
      `;

      const emailData = { from: fromAddr, to: recipientEmail, subject, html };
      console.log('📧 CHEQUE DEPOSIT EMAIL (auto):', emailData);

      // Show a browser notification in development when possible
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`Cheque deposit due: LKR ${cheque.amount}`, {
            body: `${cheque.payer_name || '-'} — Deposit on ${cheque.deposit_date ? new Date(cheque.deposit_date).toLocaleDateString() : 'N/A'}`,
            icon: '/favicon.ico'
          });
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to send cheque deposit to address:', err);
      return false;
    }
  }

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }
}

export const emailService = EmailService.getInstance();