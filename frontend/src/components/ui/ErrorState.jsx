// Displays a friendly API failure and an explicit retry action.
import Button from './Button.jsx';
import './ErrorState.css';

/** Renders an error message and retry button. */
export default function ErrorState({ message, onRetry }) {
  return <div className="error-state" role="alert"><p>{message}</p><Button variant="secondary" onClick={onRetry}>Try again</Button></div>;
}
