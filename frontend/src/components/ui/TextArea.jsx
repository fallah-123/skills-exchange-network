// Renders an accessible labelled textarea with optional character count.
import FormField from './FormField.jsx';
import './TextArea.css';

/** Renders a controlled textarea and its field metadata. */
export default function TextArea({ id, label, error, value, maxLength, required = false, ...props }) {
  return (
    <FormField id={id} label={label} error={error} required={required}>
      {(fieldProps) => (
        <>
          <textarea id={id} value={value} maxLength={maxLength} {...fieldProps} {...props} />
          {maxLength ? <small className="text-area__count">{value.length} / {maxLength}</small> : null}
        </>
      )}
    </FormField>
  );
}
