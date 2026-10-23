// Loads and updates the signed-in user's profile from the backend.
import { useEffect, useRef, useState } from 'react';
import { getMyProfile, updateMyProfile } from '../api/profile.api.js';
import { ApiError } from '../api/client.js';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import FormField from '../components/ui/FormField.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Select from '../components/ui/Select.jsx';
import TextArea from '../components/ui/TextArea.jsx';
import { BIO_MAX, EXPERIENCE_LEVELS, INTERESTS_MAX } from '../constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { validateProfile } from '../utils/validators.js';
import './ProfilePage.css';

function profileValues(profile) {
  return {
    displayName: profile.displayName || '',
    bio: profile.bio || '',
    experienceLevel: profile.experienceLevel || '',
    interests: profile.interests || '',
    githubUrl: profile.githubUrl || '',
    portfolioUrl: profile.portfolioUrl || ''
  };
}

/** Renders the editable profile form and keeps auth display data in sync. */
export default function ProfilePage() {
  const { data: profile, error: loadError, isLoading, reload } = useApi((signal) => getMyProfile(signal), []);
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const { setUser } = useAuth();
  const { showToast } = useToast();
  useDocumentTitle('My Profile');

  useEffect(() => {
    if (profile) setValues(profileValues(profile));
  }, [profile]);

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
    setFormError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !values) return;
    const nextErrors = validateProfile(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true;
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await updateMyProfile({
        displayName: values.displayName,
        bio: values.bio,
        experienceLevel: values.experienceLevel,
        interests: values.interests,
        githubUrl: values.githubUrl,
        portfolioUrl: values.portfolioUrl
      });
      setValues(profileValues(result.data));
      setUser((user) => user ? { ...user, displayName: result.data.displayName } : user);
      showToast({ type: 'success', message: result.message || 'Profile updated.' });
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') setErrors((current) => ({ ...current, ...error.details }));
      setFormError(error instanceof ApiError ? error.message : 'Unable to save your profile. Please try again.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <div className="page-shell"><LoadingBlock label="Loading profile" /></div>;
  if (loadError) return <div className="page-shell"><h1>My Profile</h1><ErrorState message={loadError.message} onRetry={reload} /></div>;
  if (!profile || !values) return null;

  return (
    <div className="page-shell profile-page">
      <h1>My Profile</h1>
      <p>Complete your profile so other developers can understand what you do.</p>
      <form className="profile-page__form" onSubmit={submit} noValidate>
        <Alert>{formError}</Alert>
        <FormField id="email" label="Email">
          {(props) => <input {...props} value={profile.email} readOnly />}
        </FormField>
        <FormField id="displayName" label="Display name" error={errors.displayName} required>
          {(props) => <input {...props} name="displayName" autoComplete="name" value={values.displayName} onChange={update} />}
        </FormField>
        <TextArea id="bio" label="Bio" value={values.bio} name="bio" error={errors.bio} maxLength={BIO_MAX} required onChange={update} />
        <Select id="experienceLevel" label="Experience level" value={values.experienceLevel} name="experienceLevel" error={errors.experienceLevel} placeholder="Choose your experience level" options={EXPERIENCE_LEVELS} required onChange={update} />
        <TextArea id="interests" label="Interests" value={values.interests} name="interests" error={errors.interests} maxLength={INTERESTS_MAX} onChange={update} />
        <FormField id="githubUrl" label="GitHub URL" error={errors.githubUrl}>
          {(props) => <input {...props} name="githubUrl" type="url" value={values.githubUrl} onChange={update} />}
        </FormField>
        <FormField id="portfolioUrl" label="Portfolio URL" error={errors.portfolioUrl}>
          {(props) => <input {...props} name="portfolioUrl" type="url" value={values.portfolioUrl} onChange={update} />}
        </FormField>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save profile'}</Button>
      </form>
    </div>
  );
}
