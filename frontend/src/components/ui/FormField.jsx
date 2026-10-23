// Associates a visible label and field-level validation message with form inputs.
import './FormField.css';

/** Renders a labelled form control and optional validation message. */
export default function FormField({ id, label, error, required = false, hint, children }) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {typeof children === 'function' ? children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': descriptionId }) : children}
      {hint && !error ? <small className="form-field__hint" id={`${id}-hint`}>{hint}</small> : null}
      {error ? <small className="form-field__error" id={`${id}-error`}>{error}</small> : null}
    </div>
  );
}
