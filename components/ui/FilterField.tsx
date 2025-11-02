import React from 'react';

interface FilterFieldProps {
  label: string;
  htmlFor?: string;
  variant?: 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'slate';
  children: React.ReactNode;
}

const variantMap: Record<string, string> = {
  blue: 'focus:ring-blue-500 focus:border-blue-500',
  green: 'focus:ring-green-500 focus:border-green-500',
  purple: 'focus:ring-purple-500 focus:border-purple-500',
  amber: 'focus:ring-amber-500 focus:border-amber-500',
  rose: 'focus:ring-rose-500 focus:border-rose-500',
  slate: 'focus:ring-slate-500 focus:border-slate-500',
};

const baseInputClasses = 'w-full px-3 py-2 border rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100';

export const FilterField: React.FC<FilterFieldProps> = ({ label, htmlFor, variant = 'blue', children }) => {
  const variantClasses = variantMap[variant] || variantMap.blue;

  // helper to merge classes
  const mergeClasses = (existing?: any) => {
    const existingStr = existing ? String(existing) : '';
    return [baseInputClasses, variantClasses, existingStr].filter(Boolean).join(' ');
  };

  // If child is a React element, clone and inject classes
  const child = React.Children.only(children);
  let renderedChild: React.ReactNode = child;
  if (React.isValidElement(child)) {
    const childProps: any = child.props || {};
    const newClassName = mergeClasses(childProps.className);
    renderedChild = React.cloneElement(child, { ...childProps, className: newClassName, id: htmlFor });
  }

  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="min-w-0">{renderedChild}</div>
    </div>
  );
};

export default FilterField;
