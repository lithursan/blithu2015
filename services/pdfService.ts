import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Account, JournalEntry, AccountType } from '../types/accounting';

export class PDFService {
  private static formatCurrency(amount: number): string {
    return `LKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private static formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private static addHeader(doc: jsPDF, title: string): void {
    // Company header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SHIVAM DISTRIBUTORS (PVT) LTD', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('A9 Road, Kanthaswamy Kovil, Kilinochchi, Sri Lanka', 20, 28);
    doc.text('Email: Shivam2025@gmail.com | Phone: +94 772819267 / +94 779095954', 20, 34);
    
    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, 50);
    
    // Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-US')}`, 20, 58);
    
    // Line separator
    doc.line(20, 65, 190, 65);
  }

  static generateAccountingDashboard(data: {
    totalAccounts: number;
    totalBalance: number;
    trialBalance: any[];
    recentEntries: any[];
    cashFlow?: any;
  }): void {
    const doc = new jsPDF();
    
    this.addHeader(doc, 'Accounting Dashboard Report');
    
    let yPos = 80;
    
    // Summary section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Accounts: ${data.totalAccounts}`, 20, yPos);
    yPos += 6;
    doc.text(`Total Balance: ${this.formatCurrency(data.totalBalance)}`, 20, yPos);
    yPos += 15;
    
    // Trial Balance section
    if (data.trialBalance.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Trial Balance', 20, yPos);
      yPos += 10;
      
      const trialBalanceData = data.trialBalance.map(account => [
        account.accountCode,
        account.accountName,
        account.accountType,
        this.formatCurrency(account.debitBalance),
        this.formatCurrency(account.creditBalance),
        this.formatCurrency(account.netBalance)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Net Balance']],
        body: trialBalanceData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' }
        }
      });
    }

    // Add Cash Flow Statement if available
    if (data.cashFlow) {
      doc.addPage();
      this.addHeader(doc, 'Statement of Cash Flows');
      
      let yPos = 80;
      
      // Operating Activities
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Cash Flows from Operating Activities', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Operating Inflows
      if (data.cashFlow.operating.inflows.length > 0) {
        doc.text('Cash Inflows:', 25, yPos);
        yPos += 5;
        data.cashFlow.operating.inflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(this.formatCurrency(item.amount), 150, yPos);
          yPos += 5;
        });
      }
      
      // Operating Outflows
      if (data.cashFlow.operating.outflows.length > 0) {
        doc.text('Cash Outflows:', 25, yPos);
        yPos += 5;
        data.cashFlow.operating.outflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(`(${this.formatCurrency(item.amount)})`, 150, yPos);
          yPos += 5;
        });
      }
      
      // Net Operating
      doc.setFont('helvetica', 'bold');
      doc.text('Net Cash from Operating Activities', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.operating.net), 150, yPos);
      yPos += 15;
      
      // Investing Activities
      doc.text('Cash Flows from Investing Activities', 20, yPos);
      yPos += 10;
      
      doc.setFont('helvetica', 'normal');
      if (data.cashFlow.investing.inflows.length > 0 || data.cashFlow.investing.outflows.length > 0) {
        data.cashFlow.investing.inflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(this.formatCurrency(item.amount), 150, yPos);
          yPos += 5;
        });
        data.cashFlow.investing.outflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(`(${this.formatCurrency(item.amount)})`, 150, yPos);
          yPos += 5;
        });
      }
      
      doc.setFont('helvetica', 'bold');
      doc.text('Net Cash from Investing Activities', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.investing.net), 150, yPos);
      yPos += 15;
      
      // Financing Activities
      doc.text('Cash Flows from Financing Activities', 20, yPos);
      yPos += 10;
      
      doc.setFont('helvetica', 'normal');
      if (data.cashFlow.financing.inflows.length > 0 || data.cashFlow.financing.outflows.length > 0) {
        data.cashFlow.financing.inflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(this.formatCurrency(item.amount), 150, yPos);
          yPos += 5;
        });
        data.cashFlow.financing.outflows.forEach((item: any) => {
          doc.text(`  ${item.accountName}`, 30, yPos);
          doc.text(`(${this.formatCurrency(item.amount)})`, 150, yPos);
          yPos += 5;
        });
      }
      
      doc.setFont('helvetica', 'bold');
      doc.text('Net Cash from Financing Activities', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.financing.net), 150, yPos);
      yPos += 15;
      
      // Summary
      doc.line(20, yPos, 190, yPos);
      yPos += 10;
      doc.text('Net Increase (Decrease) in Cash', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.totalNetCashFlow), 150, yPos);
      yPos += 8;
      doc.text('Cash at Beginning of Period', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.beginningCash), 150, yPos);
      yPos += 8;
      doc.text('Cash at End of Period', 25, yPos);
      doc.text(this.formatCurrency(data.cashFlow.endingCash), 150, yPos);
    }
    
    doc.save('accounting-dashboard.pdf');
  }

  static generateChartOfAccounts(accounts: any[]): void {
    const doc = new jsPDF();
    
    this.addHeader(doc, 'Chart of Accounts');
    
    const accountData = accounts.map(account => [
      account.code,
      account.name,
      account.type,
      this.formatCurrency(account.debitBalance || 0),
      this.formatCurrency(account.creditBalance || 0),
      this.formatCurrency(account.balance || 0),
      account.isActive ? 'Active' : 'Inactive',
      account.description || ''
    ]);
    
    autoTable(doc, {
      startY: 80,
      head: [['Code', 'Account Name', 'Type', 'Debit Balance', 'Credit Balance', 'Net Balance', 'Status', 'Description']],
      body: accountData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center' }
      }
    });
    
    doc.save('chart-of-accounts.pdf');
  }

  static generateJournalEntries(entries: any[]): void {
    const doc = new jsPDF();
    
    this.addHeader(doc, 'Journal Entries Report');
    
    let yPos = 80;
    
    entries.forEach((entry, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      // Entry header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Entry #${entry.entryNumber}`, 20, yPos);
      yPos += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${this.formatDate(entry.date)}`, 20, yPos);
      doc.text(`Status: ${entry.status}`, 120, yPos);
      yPos += 6;
      doc.text(`Description: ${entry.description}`, 20, yPos);
      yPos += 6;
      if (entry.reference) {
        doc.text(`Reference: ${entry.reference}`, 20, yPos);
        yPos += 6;
      }
      doc.text(`Total Amount: ${this.formatCurrency(entry.totalAmount)}`, 20, yPos);
      yPos += 10;
      
      // Transactions table
      if (entry.transactions && entry.transactions.length > 0) {
        const transactionData = entry.transactions.map(t => [
          t.accountCode,
          t.accountName,
          t.description || '',
          t.debitAmount > 0 ? this.formatCurrency(t.debitAmount) : '',
          t.creditAmount > 0 ? this.formatCurrency(t.creditAmount) : ''
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [['Account Code', 'Account Name', 'Description', 'Debit', 'Credit']],
          body: transactionData,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 8 },
          columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' }
          },
          margin: { left: 25, right: 25 }
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
    });
    
    doc.save('journal-entries.pdf');
  }
}