// Shows a full content-area loading indicator.
import Spinner from './Spinner.jsx';
import './LoadingBlock.css';

/** Renders a loading status block. */
export default function LoadingBlock({ label = 'Loading' }) {
  return <div className="loading-block"><Spinner label={label} /><span>{label}…</span></div>;
}
