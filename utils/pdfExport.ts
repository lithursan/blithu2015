import html2pdf from 'html2pdf.js';

// Simple interface for PDF export
interface Column {
  key: string;
  title: string;
}

interface ExportOptions {
  summary?: Record<string, string>;
}

export const exportToPDF = (
  title: string, 
  columns: Column[], 
  data: any[], 
  options?: ExportOptions
) => {
  try {
    // Create HTML content for the PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page {
            margin: 1.2cm 2.5cm 1.2cm 0.3cm;
            size: A4;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 15px 15px 15px 5px;
            font-size: 13px;
            color: #1f2937;
            line-height: 1.4;
            background-color: #ffffff;
            width: calc(100% - 20px);
            box-sizing: border-box;
          }
          .header {
            text-align: center;
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 25px;
            margin: 0 0 30px 0;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            page-break-inside: avoid;
          }
          .company-name {
            font-size: 26px;
            font-weight: bold;
            color: white;
            margin-bottom: 12px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
            letter-spacing: 1px;
          }
          .company-details {
            font-size: 13px;
            color: #e0e7ff;
            margin-bottom: 6px;
            opacity: 0.95;
            font-weight: 500;
          }
          .report-title {
            font-size: 20px;
            font-weight: bold;
            margin: 25px 0 12px 0;
            color: #1e40af;
            page-break-after: avoid;
            text-align: center;
            padding: 12px;
            background-color: #f1f5f9;
            border-radius: 8px;
            border-left: 5px solid #2563eb;
          }
          .generated-date {
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 25px;
            page-break-after: avoid;
            text-align: center;
            font-weight: 500;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            page-break-inside: auto;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            overflow: visible;
            table-layout: auto;
          }
          thead {
            display: table-header-group;
            page-break-inside: avoid;
          }
          tbody {
            display: table-row-group;
            page-break-inside: auto;
          }
          th, td {
            border: 1.5px solid #d1d5db;
            padding: 8px 6px;
            text-align: center;
            font-size: 10px;
            word-wrap: break-word;
            page-break-inside: auto;
            vertical-align: middle;
            max-width: none;
          }
          th {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            font-weight: bold;
            page-break-after: auto;
            text-align: center;
            font-size: 11px;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
            letter-spacing: 0.5px;
          }
          tr {
            page-break-inside: auto;
            page-break-after: auto;
          }
          tbody tr:nth-child(even) {
            background-color: #f8fafc;
          }
          tbody tr:hover {
            background-color: #e0e7ff;
          }
          tbody tr:last-child {
            page-break-after: auto;
          }
          td {
            border-bottom: 1px solid #e5e7eb;
            font-weight: 500;
            color: #374151;
          }
          .currency {
            text-align: right;
            font-weight: bold;
            color: #059669;
          }
          .status {
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 10px;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .summary {
            margin-top: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #f1f5f9 0%, #e0e7ff 100%);
            border-left: 6px solid #2563eb;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            page-break-inside: avoid;
          }
          .summary-title {
            font-weight: bold;
            margin-bottom: 15px;
            color: #1e40af;
            font-size: 16px;
            text-align: center;
          }
          .summary-item {
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            color: #374151;
          }
          .signature-section {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            page-break-inside: avoid;
            padding-top: 20px;
          }
          .signature-box {
            text-align: center;
            min-width: 200px;
            margin: 0 10px;
          }
          .signature-line {
            border-top: 2px solid #374151;
            width: 180px;
            margin: 50px auto 8px auto;
          }
          .signature-label {
            font-size: 12px;
            color: #374151;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
            font-weight: 600;
            border-top: 3px solid #2563eb;
            padding: 20px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 8px;
            page-break-inside: avoid;
          }
          .page-break {
            page-break-before: always;
          }
          @media print {
            body { 
              font-size: 12px; 
              line-height: 1.3;
            }
            th, td { 
              padding: 8px 6px; 
              font-size: 10px;
            }
            .header { 
              padding: 20px; 
            }
            .company-name { 
              font-size: 24px; 
            }
            .report-title { 
              font-size: 18px; 
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">SHIVAM DISTRIBUTORS (PVT) LTD</div>
          <div class="company-details">A9 Road, Kanthaswamy Kovil, Kilinochchi, Sri Lanka</div>
          <div class="company-details">Email: Shivam2025@gmail.com | Phone: +94 772819267 / +94 779095954</div>
        </div>
        
        <div class="report-title">${title}</div>
        <div class="generated-date">Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</div>
        
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${col.title}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                ${columns.map(col => {
                  let value = item[col.key];
                  
                  // Format common data types
                  if (value === null || value === undefined) {
                    value = '-';
                  } else if (typeof value === 'string' && value.includes('T') && value.includes('-')) {
                    // Format dates
                    try {
                      const date = new Date(value);
                      if (!isNaN(date.getTime())) {
                        value = date.toLocaleDateString('en-GB');
                      }
                    } catch (e) {
                      // Keep original value if date parsing fails
                    }
                  }
                  
                  return `<td>${String(value)}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>`;

    // Add summary if provided
    if (options?.summary) {
      htmlContent += `
        <div class="summary">
          <div class="summary-title">Summary</div>
          ${Object.entries(options.summary).map(([key, value]) => 
            `<div class="summary-item"><strong>${key}:</strong> ${value}</div>`
          ).join('')}
        </div>`;
    }

    htmlContent += `
        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Prepared By</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Checked By</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Authorized Signature</div>
          </div>
        </div>
        
        <div class="footer">
          Report generated by Shivam Distributors Management System
        </div>
      </body>
      </html>`;

    // Configure PDF options for A4 format with better page handling
    const options_pdf = {
      margin: [1.2, 2.2, 1.2, 0.3] as [number, number, number, number],
      filename: `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 1.2,
        useCORS: true,
        letterRendering: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        dpi: 192,
        height: null,
        width: null,
        logging: false,
        proxy: null
      },
      jsPDF: { 
        unit: 'cm', 
        format: 'a4', 
        orientation: 'portrait' as const,
        compress: true
      },
      pagebreak: { 
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.page-break',
        after: '.page-break',
        avoid: 'tr'
      }
    };

    // Generate and download PDF
    html2pdf().set(options_pdf).from(htmlContent).save();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF. Please try again.');
  }
};

// Utility function to format currency
export const formatCurrency = (amount: number) => {
  return `LKR ${amount.toLocaleString()}`;
};