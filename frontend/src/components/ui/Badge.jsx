// Renders compact status and metadata labels.
import './Badge.css';

/** Renders a text badge with a semantic appearance. */
export default function Badge({ children, variant = 'neutral' }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
