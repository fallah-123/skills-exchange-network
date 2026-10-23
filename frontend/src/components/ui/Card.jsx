// Provides a consistent bordered surface for page content and summaries.
import './Card.css';

/** Renders children inside a standard content card. */
export default function Card({ children, className = '' }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}
