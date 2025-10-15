// src/webview.d.ts (or similar)

// Define the structure of the native Android object
interface AndroidNativeBridge {
  /**
   * Calls the native Android method to print a bill.
   * @param htmlContent The HTML string of the bill to be printed.
   */
  printBill(htmlContent: string): void;

  // Add any other methods you expose from Android
  // showToast(message: string): void;
}

// Extend the global Window interface to include your custom bridge
interface Window {
  AndroidBridge: AndroidNativeBridge | undefined;
}