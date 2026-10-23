// Handles account creation and displays server-side validation feedback.
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../api/auth.api.js';
import { ApiError } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import FormField from '../components/ui/FormField.jsx';
import Alert from '../components/ui/Alert.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { validateDisplayName, validateEmail, validatePassword } from '../utils/validators.js';
import './AuthPage.css';

/** Renders the controlled registration form. */
export default function RegisterPage() {
  const [values, setValues] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  useDocumentTitle('Create account');

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
    setFormError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = {};
    const displayError = validateDisplayName(values.displayName);
    const emailError = validateEmail(values.email);
    const passwordError = validatePassword(values.password);
    if (displayError) nextErrors.displayName = displayError;
    if (emailError) nextErrors.email = emailError;
    if (passwordError) nextErrors.password = passwordError;
    if (values.confirmPassword !== values.password) nextErrors.confirmPassword = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true;
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await registerUser({ displayName: values.displayName, email: values.email, password: values.password });
      showToast({ type: 'success', message: result.message || 'Registration successful. Please log in.' });
      navigate('/login', { state: { registered: true, email: values.email } });
    } catch (error) {
      if (error instanceof ApiError) {
        const serverErrors = error.code === 'VALIDATION_ERROR' ? error.details : {};
        if (error.code === 'EMAIL_TAKEN') serverErrors.email = error.message;
        setErrors((current) => ({ ...current, ...serverErrors }));
      }
      setFormError(error.message);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell auth-page">
      <section className="auth-page__panel">
        <h1>Create your account</h1>
        <p>Start by adding your developer profile.</p>
        <Alert>{formError}</Alert>
        <form onSubmit={submit} noValidate>
          <FormField id="displayName" label="Display name" error={errors.displayName} required>
            {(props) => <input {...props} name="displayName" autoComplete="name" value={values.displayName} onChange={update} />}
          </FormField>
          <FormField id="email" label="Email" error={errors.email} required>
            {(props) => <input {...props} name="email" type="email" autoComplete="email" value={values.email} onChange={update} />}
          </FormField>
          <FormField id="password" label="Password" error={errors.password} required>
            {(props) => <input {...props} name="password" type="password" autoComplete="new-password" value={values.password} onChange={update} />}
          </FormField>
          <FormField id="confirmPassword" label="Confirm password" error={errors.confirmPassword} required>
            {(props) => <input {...props} name="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={update} />}
          </FormField>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
        </form>
        <p className="auth-page__footer">Already registered? <Link to="/login">Log in</Link></p>
      </section>
    </div>
  );
}
