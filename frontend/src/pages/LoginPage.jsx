// Handles sign-in, session creation, and return-to-route navigation.
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import FormField from '../components/ui/FormField.jsx';
import Alert from '../components/ui/Alert.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { validateEmail, validatePassword } from '../utils/validators.js';
import './AuthPage.css';

/** Renders the controlled login form and restores an intended protected route. */
export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [values, setValues] = useState({ email: location.state?.email || '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(location.state?.registered ? 'Your account is ready. Please log in.' : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  useDocumentTitle('Log in');
  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
    setFormError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = {};
    const emailError = validateEmail(values.email);
    const passwordError = validatePassword(values.password);
    if (emailError) nextErrors.email = emailError;
    if (passwordError) nextErrors.password = passwordError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true;
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await login(values);
      showToast({ type: 'success', message: result.message || 'Logged in successfully.' });
      const from = location.state?.from;
      navigate(from?.pathname ? `${from.pathname}${from.search || ''}${from.hash || ''}` : '/dashboard', { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError && error.code === 'INVALID_CREDENTIALS' ? 'Invalid email or password.' : error.message);
      if (error.code === 'VALIDATION_ERROR') setErrors((current) => ({ ...current, ...error.details }));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }
  return (
    <div className="page-shell auth-page">
      <section className="auth-page__panel">
        <h1>Log in</h1>
        <Alert>{formError}</Alert>
        <form onSubmit={submit} noValidate>
          <FormField id="email" label="Email" error={errors.email} required>
            {(props) => <input {...props} name="email" type="email" autoComplete="email" value={values.email} onChange={update} />}
          </FormField>
          <FormField id="password" label="Password" error={errors.password} required>
            {(props) => <input {...props} name="password" type="password" autoComplete="current-password" value={values.password} onChange={update} />}
          </FormField>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Logging in…' : 'Log in'}</Button>
        </form>
        <p className="auth-page__footer">New to the network? <Link to="/register">Create an account</Link></p>
      </section>
    </div>
  );
}
