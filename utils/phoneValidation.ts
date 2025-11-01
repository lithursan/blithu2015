// Phone number validation utilities

export interface PhoneValidationResult {
  isValid: boolean;
  message: string;
  normalizedPhone?: string;
}

export const validatePhoneFormat = (phone: string): PhoneValidationResult => {
  const trimmedPhone = phone.trim();
  
  if (!trimmedPhone) {
    return { isValid: false, message: 'Phone number is required' };
  }

  // Remove all spaces, dashes, parentheses for validation
  const cleanPhone = trimmedPhone.replace(/[\s\-()]/g, '');
  
  // Basic format validation - allow digits and + at the start
  const basicRegex = /^[+]?\d+$/;
  if (!basicRegex.test(cleanPhone)) {
    return { isValid: false, message: 'Phone number can only contain digits, spaces, dashes, parentheses, and + at the start' };
  }

  // Length validation (7-15 digits internationally)
  const digitCount = cleanPhone.replace(/[^0-9]/g, '').length;
  if (digitCount < 7) {
    return { isValid: false, message: 'Phone number too short (minimum 7 digits)' };
  }
  if (digitCount > 15) {
    return { isValid: false, message: 'Phone number too long (maximum 15 digits)' };
  }

  // Sri Lankan phone number patterns (optional specific validation)
  const sriLankanMobileRegex = /^(\+94|0)?[7][0-9]{8}$/;
  const sriLankanLandlineRegex = /^(\+94|0)?[1-9][0-9]{8}$/;
  
  if (cleanPhone.startsWith('+94') || cleanPhone.startsWith('0')) {
    if (!sriLankanMobileRegex.test(cleanPhone) && !sriLankanLandlineRegex.test(cleanPhone)) {
      return { 
        isValid: false, 
        message: 'Invalid Sri Lankan phone format. Mobile: 077XXXXXXX, Landline: 011XXXXXXX' 
      };
    }
  }

  return { 
    isValid: true, 
    message: 'Valid phone number format',
    normalizedPhone: trimmedPhone 
  };
};

export const normalizePhoneNumber = (phone: string): string => {
  // Normalize phone number for storage and comparison
  let normalized = phone.trim();
  
  // Convert local format to international
  if (normalized.startsWith('0')) {
    normalized = '+94' + normalized.substring(1);
  }
  
  return normalized;
};

export const formatPhoneForDisplay = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  
  // Format Sri Lankan numbers
  if (phone.startsWith('+94') && clean.length === 11) {
    return `+94 ${clean.substring(2, 4)} ${clean.substring(4, 7)} ${clean.substring(7)}`;
  }
  
  // Format other international numbers
  if (phone.startsWith('+') && clean.length > 7) {
    return phone; // Keep international format as is
  }
  
  // Format local numbers
  if (clean.length === 10 && clean.startsWith('0')) {
    return `${clean.substring(0, 3)} ${clean.substring(3, 6)} ${clean.substring(6)}`;
  }
  
  return phone; // Return as is if no pattern matches
};