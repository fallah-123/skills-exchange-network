// Displays an accessible form-level alert.
import './Alert.css';

/** Renders an alert message when content is provided. */
export default function Alert({ children, variant = 'error' }) {
  if (!children) return null;
  return <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>{children}</div>;
}
