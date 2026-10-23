// Lists incoming and outgoing requests with URL-backed tab and status filter.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listRequests, respondToRequest } from '../api/requests.api.js';
import RequestCard from '../components/domain/RequestCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import { REQUEST_STATUS } from '../constants.js';
import { useToast } from '../context/ToastContext.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import './RequestsPage.css';

const VALID_STATUSES = Object.values(REQUEST_STATUS);

/** Renders request tabs, filters, and recipient-only accept/reject actions. */
export default function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'outgoing' ? 'outgoing' : 'incoming';
  const statusParam = params.get('status') || 'all';
  const status = statusParam === 'all' || VALID_STATUSES.includes(statusParam) ? statusParam : 'all';
  const request = useApi((signal) => listRequests(tab, status === 'all' ? undefined : status, signal), [tab, status]);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const { showToast } = useToast();
  useDocumentTitle('Collaboration Requests');
  useEffect(() => setItems(request.data || []), [request.data]);

  function updateParams(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next);
  }
  async function respond(action, item) {
    setBusyId(item.id);
    try {
      const result = await respondToRequest(item.id, action);
      showToast({ type: 'success', message: result.message || `Request ${action}ed.` });
      setItems((current) => {
        if (status !== 'all' && result.data.status !== status) return current.filter((entry) => entry.id !== item.id);
        return current.map((entry) => entry.id === item.id ? result.data : entry);
      });
    } catch (error) {
      showToast({ type: 'error', message: error.message });
      if (['INVALID_STATE', 'REQUEST_NOT_FOUND'].includes(error.code)) request.reload();
    } finally {
      setBusyId(null);
    }
  }

  const emptyTitle = tab === 'incoming' ? 'No incoming requests match this filter.' : 'No outgoing requests match this filter.';
  return (
    <div className="page-shell requests-page">
      <h1>Collaboration Requests</h1>
      <nav className="requests-page__tabs" aria-label="Request direction">
        <button type="button" aria-current={tab === 'incoming' ? 'page' : undefined} onClick={() => updateParams({ tab: 'incoming' })}>Incoming</button>
        <button type="button" aria-current={tab === 'outgoing' ? 'page' : undefined} onClick={() => updateParams({ tab: 'outgoing' })}>Outgoing</button>
      </nav>
      <div className="requests-page__filter">
        <label htmlFor="request-status">Filter by status</label>
        <select id="request-status" value={status} onChange={(event) => updateParams({ status: event.target.value === 'all' ? '' : event.target.value })}>
          <option value="all">All</option>
          <option value={REQUEST_STATUS.PENDING}>Pending</option>
          <option value={REQUEST_STATUS.ACCEPTED}>Accepted</option>
          <option value={REQUEST_STATUS.REJECTED}>Rejected</option>
        </select>
      </div>
      {request.isLoading ? <LoadingBlock label={`Loading ${tab} requests`} /> : null}
      {request.error ? <ErrorState message={request.error.message} onRetry={request.reload} /> : null}
      {!request.isLoading && !request.error && items.length === 0 ? <EmptyState title={emptyTitle} /> : null}
      {!request.isLoading && !request.error && items.length ? (
        <div className="requests-page__list">
          {items.map((item) => <RequestCard key={item.id} request={item} direction={tab} busy={busyId === item.id} onRespond={respond} />)}
        </div>
      ) : null}
    </div>
  );
}
