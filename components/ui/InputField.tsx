import React from 'react';

interface InputFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'email';
  value: string | number;
  onChange: (value: string | number) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}

export const InputField: React.FC<InputFieldProps> = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  required,
  placeholder,
  min,
  max,
  className = ''
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = type === 'number' ? 
      (e.target.value === '' ? 0 : parseFloat(e.target.value) || 0) : 
      e.target.value;
    onChange(newValue);
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        id={id}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        min={min}
        max={max}
        className={`bg-slate-50 border text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white ${
          error ? 'border-red-500 dark:border-red-500' : 'border-slate-300'
        }`}
        required={required}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required,
  placeholder,
  className = ''
}) => {
  return (
    <div className={className}>
      <label htmlFor={id} className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-slate-50 border text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white ${
          error ? 'border-red-500 dark:border-red-500' : 'border-slate-300'
        }`}
        required={required}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};