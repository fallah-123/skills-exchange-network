// Renders a collaboration request status with both text and semantic color.
import Badge from '../ui/Badge.jsx';
import { REQUEST_STATUS } from '../../constants.js';
import './StatusBadge.css';

/** Displays one supported request state. */
export default function StatusBadge({ status }) {
  const statusLabels = {
    [REQUEST_STATUS.PENDING]: 'Pending',
    [REQUEST_STATUS.ACCEPTED]: 'Accepted',
    [REQUEST_STATUS.REJECTED]: 'Rejected'
  };
  return <span className="status-badge"><Badge variant={statusLabels[status] ? status : 'neutral'}>{statusLabels[status] || 'Unknown'}</Badge></span>;
}
