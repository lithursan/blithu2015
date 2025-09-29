import { useState, useCallback } from 'react';

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface ValidationErrors {
  [fieldName: string]: string;
}

export const useValidation = () => {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateField = useCallback((
    fieldName: string, 
    value: any, 
    rules: ValidationRule
  ): boolean => {
    let error = '';

    // Required validation
    if (rules.required && (!value || value.toString().trim() === '')) {
      error = `${fieldName} is required`;
    }
    // Length validations for strings
    else if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        error = `${fieldName} must be at least ${rules.minLength} characters`;
      } else if (rules.maxLength && value.length > rules.maxLength) {
        error = `${fieldName} must not exceed ${rules.maxLength} characters`;
      } else if (rules.pattern && !rules.pattern.test(value)) {
        error = `${fieldName} format is invalid`;
      }
    }
    // Number validations
    else if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        error = `${fieldName} must be at least ${rules.min}`;
      } else if (rules.max !== undefined && value > rules.max) {
        error = `${fieldName} must not exceed ${rules.max}`;
      }
    }

    // Custom validation
    if (!error && rules.custom) {
      const customError = rules.custom(value);
      if (customError) {
        error = customError;
      }
    }

    // Update errors state
    setErrors(prev => ({
      ...prev,
      [fieldName]: error
    }));

    return !error;
  }, []);

  const validateForm = useCallback((
    formData: Record<string, any>,
    validationRules: Record<string, ValidationRule>
  ): boolean => {
    let isValid = true;
    const newErrors: ValidationErrors = {};

    Object.keys(validationRules).forEach(fieldName => {
      const value = formData[fieldName];
      const rules = validationRules[fieldName];
      
      if (!validateField(fieldName, value, rules)) {
        isValid = false;
      }
    });

    return isValid;
  }, [validateField]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const clearFieldError = useCallback((fieldName: string) => {
    setErrors(prev => ({
      ...prev,
      [fieldName]: ''
    }));
  }, []);

  const getFieldError = useCallback((fieldName: string): string => {
    return errors[fieldName] || '';
  }, [errors]);

  const hasErrors = useCallback((): boolean => {
    return Object.values(errors).some(error => error !== '');
  }, [errors]);

  return {
    errors,
    validateField,
    validateForm,
    clearErrors,
    clearFieldError,
    getFieldError,
    hasErrors
  };
};

// Validation rules for common fields
export const validationRules = {
  required: { required: true },
  email: { 
    required: true, 
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ 
  },
  phone: { 
    pattern: /^[\d\s\-\+\(\)]+$/ 
  },
  price: { 
    required: true, 
    min: 0 
  },
  stock: { 
    required: true, 
    min: 0 
  },
  name: { 
    required: true, 
    minLength: 2, 
    maxLength: 100 
  },
  sku: { 
    required: true, 
    minLength: 2, 
    maxLength: 50 
  }
};