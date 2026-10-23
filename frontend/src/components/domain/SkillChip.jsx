// Renders a skill label and optional accessible add/remove control.
import './SkillChip.css';

/** Displays one skill chip with an optional mutation action. */
export default function SkillChip({ skill, category, action, actionLabel, disabled = false }) {
  return (
    <span className={`skill-chip skill-chip--${category}`}>
      <span>{skill.name}</span>
      {action ? <button type="button" aria-label={actionLabel} disabled={disabled} onClick={() => action(skill)}>{category === 'remove' ? 'Remove' : 'Add'}</button> : null}
    </span>
  );
}
