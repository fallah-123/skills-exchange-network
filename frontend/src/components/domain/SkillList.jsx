// Shows current skills and the catalogue choices for one assignment category.
import { useMemo, useState } from 'react';
import SkillChip from './SkillChip.jsx';
import './SkillList.css';

/** Renders a searchable skill assignment panel. */
export default function SkillList({ type, skills, catalogue, busyKey, onAdd, onRemove }) {
  const [filter, setFilter] = useState('');
  const title = type === 'offered' ? 'Skills I offer' : 'Skills I want';
  const currentHeading = type === 'offered' ? 'Offered skills' : 'Wanted skills';
  const colorType = type === 'offered' ? 'offered' : 'wanted';
  const assignedIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills]);
  const available = catalogue.filter((skill) => !assignedIds.has(skill.id) && skill.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section className="skill-list">
      <h2>{title}</h2>
      <p>{type === 'offered' ? 'Things I can contribute' : 'Things I want to learn or find in collaborators'}</p>
      <h3>{currentHeading}</h3>
      {skills.length ? (
        <div className="skill-list__chips">
          {skills.map((skill) => (
            <SkillChip key={skill.id} skill={skill} category={colorType} action={onRemove} disabled={busyKey === `${type}-${skill.id}`} actionLabel={`Remove ${skill.name} from skills you ${type === 'offered' ? 'offer' : 'want'}`} />
          ))}
        </div>
      ) : <p className="skill-list__empty">No skills added to this list yet.</p>}
      <div className="skill-list__add">
        <h3>Add a skill</h3>
        <label htmlFor={`${type}-filter`}>Filter skills</label>
        <input id={`${type}-filter`} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Type a skill name" />
        {available.length ? (
          <div className="skill-list__chips" aria-label={`Available ${type} skills`}>
            {available.map((skill) => (
              <SkillChip key={skill.id} skill={skill} category={colorType} action={onAdd} disabled={busyKey === `${type}-${skill.id}`} actionLabel={`Add ${skill.name} to skills you ${type === 'offered' ? 'offer' : 'want'}`} />
            ))}
          </div>
        ) : <p className="skill-list__empty">{catalogue.length ? 'No matching skills available.' : 'The skill catalogue is empty.'}</p>}
      </div>
    </section>
  );
}
