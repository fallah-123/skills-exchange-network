// Sends, accepts, or rejects the current user's collaboration request.
import { useState } from 'react';
import { respondToRequest } from '../../api/requests.api.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { REQUEST_STATUS } from '../../constants.js';
import RequestComposer from './RequestComposer.jsx';
import './ConnectionAction.css';

/** Renders the permitted action for a developer connection state. */
export default function ConnectionAction({ developerId, connection, onChanged }) {
  const [composing, setComposing] = useState(false);
  const [working, setWorking] = useState(false);
  const { showToast } = useToast();
  async function respond(action) {
    setWorking(true);
    try {
      const result = await respondToRequest(connection.requestId, action);
      showToast({ type: 'success', message: result.message || `Request ${action}ed.` });
      await onChanged();
    } catch (error) {
      showToast({ type: 'error', message: error.message });
      if (['INVALID_STATE', 'REQUEST_NOT_FOUND'].includes(error.code)) await onChanged();
    } finally {
      setWorking(false);
    }
  }
  if (connection?.status === REQUEST_STATUS.ACCEPTED) return <div className="connection-action"><Badge variant="accepted">Connected</Badge></div>;
  if (connection?.status === REQUEST_STATUS.PENDING && connection.direction === 'outgoing') return <div className="connection-action"><Badge variant="pending">Request pending</Badge></div>;
  if (connection?.status === REQUEST_STATUS.PENDING && connection.direction === 'incoming') {
    return (
      <div className="connection-action">
        <p>This developer sent you a request.</p>
        <div className="connection-action__buttons">
          <Button disabled={working} onClick={() => respond('accept')}>Accept</Button>
          <Button variant="danger" disabled={working} onClick={() => respond('reject')}>Reject</Button>
        </div>
      </div>
    );
  }
  if (composing) return <div className="connection-action"><RequestComposer developerId={developerId} onCancel={() => setComposing(false)} onSent={async () => { setComposing(false); await onChanged(); }} /></div>;
  return <div className="connection-action"><Button onClick={() => setComposing(true)}>Send collaboration request</Button></div>;
}
