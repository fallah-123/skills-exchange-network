// Shows one collaboration request and its permitted response controls.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatDate } from '../../utils/format.js';
import { REQUEST_STATUS } from '../../constants.js';
import './RequestCard.css';

/** Renders an incoming or outgoing request summary. */
export default function RequestCard({ request, direction, busy, onRespond }) {
  const [confirmReject, setConfirmReject] = useState(false);
  const isIncomingPending = direction === 'incoming' && request.status === REQUEST_STATUS.PENDING;
  return (
    <Card className="request-card">
      <div className="request-card__header">
        <h2><Link to={`/developers/${request.counterpart.id}`}>{request.counterpart.displayName}</Link></h2>
        <StatusBadge status={request.status} />
      </div>
      <p className="request-card__message">{request.message || 'No message'}</p>
      <p className="request-card__date">{direction === 'incoming' ? 'Received' : 'Sent'} {formatDate(request.createdAt)}</p>
      {direction === 'outgoing' && request.status === REQUEST_STATUS.REJECTED ? <p className="request-card__hint">You can send a new request from their profile.</p> : null}
      {isIncomingPending ? (
        confirmReject ? (
          <div className="request-card__confirm" role="group" aria-label="Confirm request rejection">
            <p>Reject this request? This cannot be undone.</p>
            <Button variant="danger" disabled={busy} onClick={() => onRespond('reject', request)}>Confirm</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmReject(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="request-card__actions">
            <Button disabled={busy} onClick={() => onRespond('accept', request)}>Accept</Button>
            <Button variant="danger" disabled={busy} onClick={() => setConfirmReject(true)}>Reject</Button>
          </div>
        )
      ) : null}
    </Card>
  );
}
