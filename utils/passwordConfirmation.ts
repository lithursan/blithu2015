import { supabase } from '../supabaseClient';

/**
 * Prompts admin user for password confirmation before allowing delete operations
 * @param userEmail - Current user's email for authentication
 * @returns Promise<boolean> - true if password is correct, false otherwise
 */
export const confirmAdminPassword = async (userEmail: string): Promise<boolean> => {
  const password = prompt('🔐 Admin Security Check\n\nPlease enter the admin password to confirm this delete operation:');
  
  if (!password) {
    return false; // User cancelled
  }

  // Check against hardcoded admin password
  if (password === '1234') {
    return true;
  } else {
    alert('❌ Incorrect password. Delete operation cancelled.');
    return false;
  }
};

/**
 * Shows a secure confirmation dialog for delete operations
 * @param itemName - Name of the item being deleted
 * @param itemType - Type of item (e.g., 'customer', 'order', 'product')
 * @param userEmail - Current user's email for password verification
 * @returns Promise<boolean> - true if user confirms and password is correct
 */
export const confirmSecureDelete = async (
  itemName: string, 
  itemType: string, 
  userEmail: string
): Promise<boolean> => {
  // First confirmation
  const firstConfirm = confirm(
    `⚠️ DELETE CONFIRMATION\n\n` +
    `You are about to permanently delete:\n` +
    `${itemType}: ${itemName}\n\n` +
    `This action cannot be undone.\n\n` +
    `Click OK to proceed to password verification.`
  );

  if (!firstConfirm) {
    return false;
  }

  // Password verification only
  const passwordConfirmed = await confirmAdminPassword(userEmail);
  
  return passwordConfirmed;
};