import './Brand.css';

/** The supplied brand symbol and the owner's corrected, accessible wordmark. */
export default function Brand({ compact = false, inverse = false }) {
  return <span className={`brand${compact ? ' brand--compact' : ''}${inverse ? ' brand--inverse' : ''}`}>
    <img className="brand__symbol" src="/brand/symbol.png" width="48" height="48" alt={compact ? 'Skill Developers Network' : ''} />
    {!compact && <span className="brand__wordmark">Skill Developers<span>Network</span></span>}
  </span>;
}
