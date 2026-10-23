// Renders stacked, dismissible toast messages in a polite live region.
import Button from './Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import './ToastContainer.css';

/** Displays all active application toasts. */
export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`} role="status">
          <span>{toast.message}</span>
          <Button variant="secondary" aria-label="Dismiss message" onClick={() => dismissToast(toast.id)}>Dismiss</Button>
        </div>
      ))}
    </div>
  );
}
