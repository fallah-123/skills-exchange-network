// Indicates that a small operation is in progress.
import './Spinner.css';

/** Renders an animated spinner with an accessible label. */
export default function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status"><span className="visually-hidden">{label}</span></span>;
}
