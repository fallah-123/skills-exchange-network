// Provides a consistent explanation for a section with no data.
import './EmptyState.css';

/** Renders an empty-state heading with supporting content. */
export default function EmptyState({ title, children }) {
  return <div className="empty-state"><h2>{title}</h2>{children ? <p>{children}</p> : null}</div>;
}
