// Manages the signed-in user's offered and wanted skill assignments.
import { useEffect, useState } from 'react';
import { addSkill, getMySkills, listSkills, removeSkill } from '../api/skills.api.js';
import { ApiError } from '../api/client.js';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import SkillList from '../components/domain/SkillList.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import './SkillsPage.css';

/** Renders skill-category panels and server-confirmed add/remove operations. */
export default function SkillsPage() {
  const catalogueRequest = useApi((signal) => listSkills(signal), []);
  const skillsRequest = useApi((signal) => getMySkills(signal), []);
  const [skills, setSkills] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const { showToast } = useToast();
  useDocumentTitle('My Skills');

  useEffect(() => {
    if (skillsRequest.data) setSkills(skillsRequest.data);
  }, [skillsRequest.data]);
  async function mutate(action, type, skill) {
    const key = `${type}-${skill.id}`;
    setBusyKey(key);
    try {
      const result = action === 'add' ? await addSkill(type, skill.id) : await removeSkill(type, skill.id);
      setSkills((current) => ({
        ...current,
        [type]: action === 'add'
          ? [...current[type].filter((item) => item.id !== result.data.id), result.data]
          : current[type].filter((item) => item.id !== skill.id)
      }));
      showToast({ type: 'success', message: result.message || (action === 'add' ? 'Skill added.' : 'Skill removed.') });
    } catch (error) {
      showToast({ type: 'error', message: error.message });
      if (error instanceof ApiError && ['SKILL_ALREADY_ADDED', 'SKILL_NOT_FOUND', 'SKILL_NOT_ASSIGNED'].includes(error.code)) {
        catalogueRequest.reload();
        skillsRequest.reload();
      }
    } finally {
      setBusyKey('');
    }
  }

  const loading = catalogueRequest.isLoading || skillsRequest.isLoading;
  if (loading && !skills) return <div className="page-shell"><h1>My Skills</h1><LoadingBlock label="Loading skills" /></div>;
  return (
    <div className="page-shell skills-page">
      <h1>My Skills</h1>
      <p>Show what you can contribute and what you hope to learn.</p>
      {catalogueRequest.error ? <ErrorState message={catalogueRequest.error.message} onRetry={catalogueRequest.reload} /> : null}
      {skillsRequest.error && !skills ? <ErrorState message={skillsRequest.error.message} onRetry={skillsRequest.reload} /> : null}
      {skills ? (
        <div className="skills-page__grid">
          <SkillList type="offered" skills={skills.offered} catalogue={catalogueRequest.data || []} busyKey={busyKey} onAdd={(skill) => mutate('add', 'offered', skill)} onRemove={(skill) => mutate('remove', 'offered', skill)} />
          <SkillList type="wanted" skills={skills.wanted} catalogue={catalogueRequest.data || []} busyKey={busyKey} onAdd={(skill) => mutate('add', 'wanted', skill)} onRemove={(skill) => mutate('remove', 'wanted', skill)} />
        </div>
      ) : null}
    </div>
  );
}
