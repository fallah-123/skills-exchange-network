// Renders an accessible labelled select control.
import FormField from './FormField.jsx';
import './Select.css';

/** Renders a select with labelled options and validation feedback. */
export default function Select({ id, label, error, value, options, placeholder, required = false, ...props }) {
  return (
    <FormField id={id} label={label} error={error} required={required}>
      {(fieldProps) => (
        <select id={id} value={value} {...fieldProps} {...props}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
    </FormField>
  );
}
