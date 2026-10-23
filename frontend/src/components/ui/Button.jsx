// Renders accessible buttons with consistent primary, secondary, and danger variants.
import './Button.css';

/** Renders a styled action button. */
export default function Button({ children, variant = 'primary', type = 'button', className = '', ...props }) {
  return <button className={`button button--${variant} ${className}`.trim()} type={type} {...props}>{children}</button>;
}
