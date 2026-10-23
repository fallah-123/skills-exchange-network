// Composes and submits an optional-message collaboration request.
import { useRef, useState } from 'react';
import { createRequest } from '../../api/requests.api.js';
import Button from '../ui/Button.jsx';
import TextArea from '../ui/TextArea.jsx';
import { MESSAGE_MAX } from '../../constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { validateRequestMessage } from '../../utils/validators.js';
import './RequestComposer.css';

/** Renders the inline collaboration request form. */
export default function RequestComposer({ developerId, onCancel, onSent }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const { showToast } = useToast();
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const validationError = validateRequestMessage(message);
    setError(validationError);
    if (validationError) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const result = await createRequest(developerId, message);
      showToast({ type: 'success', message: result.message || 'Collaboration request sent.' });
      await onSent();
    } catch (requestError) {
      setFormError(requestError.message);
      if (requestError.code === 'VALIDATION_ERROR') setError(requestError.details?.message || '');
      showToast({ type: 'error', message: requestError.message });
      if (['DUPLICATE_REQUEST', 'USER_NOT_FOUND'].includes(requestError.code)) await onSent();
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }
  return (
    <form className="request-composer" onSubmit={submit} noValidate>
      <TextArea id="request-message" label="Message (optional)" value={message} error={error} maxLength={MESSAGE_MAX} onChange={(event) => { setMessage(event.target.value); setError(''); setFormError(''); }} />
      {formError ? <p className="request-composer__error" role="alert">{formError}</p> : null}
      <div className="request-composer__actions">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send request'}</Button>
        <Button variant="secondary" disabled={isSubmitting} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
