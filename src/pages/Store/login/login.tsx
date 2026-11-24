import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { STORAGE_PREFIX, readStorage, removeStorage, writeStorage } from '../../../services/storage';
import { classNames } from '../../../utils/helpers';
import { EMAIL_PATTERN } from '../../../utils/forms';
import { getRedirectPath } from '../../../utils/navigation';
import './Login.css';

/** Chave do localStorage onde o e-mail é guardado quando "Lembrar de mim" está marcado. */
const REMEMBERED_EMAIL_KEY = `${STORAGE_PREFIX}rememberedEmail`;

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

function readRememberedEmail(): string {
  try {
    return readStorage<string>(REMEMBERED_EMAIL_KEY, () => '');
  } catch {
    return '';
  }
}

function saveRememberedEmail(email: string, shouldRemember: boolean): void {
  try {
    if (shouldRemember) {
      writeStorage(REMEMBERED_EMAIL_KEY, email);
    } else {
      removeStorage(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    // Lembrar o e-mail é apenas uma conveniência: falhas de storage não devem impedir o login.
  }
}

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState<string>(readRememberedEmail);
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const redirectPath = getRedirectPath(location.state);

  // Quem já está autenticado não precisa ver a tela de login.
  if (!isLoading && isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  const validate = (): LoginFieldErrors => {
    const errors: LoginFieldErrors = {};

    if (!email.trim()) {
      errors.email = 'Informe o seu e-mail.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Informe um e-mail válido.';
    }

    if (!password) {
      errors.password = 'Informe a sua senha.';
    }

    return errors;
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setEmail(event.target.value);
    setFieldErrors((previous) => ({ ...previous, email: undefined }));
    setFormError(null);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setPassword(event.target.value);
    setFieldErrors((previous) => ({ ...previous, password: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);

    if (errors.email || errors.password) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email, password);
      saveRememberedEmail(email.trim().toLowerCase(), rememberMe);
      // O redirecionamento acontece pelo <Navigate> acima, assim que o usuário é autenticado.
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StoreLayout>
      <div className="login">
        <SectionCard
          className="login__card"
          title={<span className="login__title">Já tenho conta</span>}
        >
          <div className="login__content">
            <p className="login__subtitle">Entre para acompanhar seus pedidos.</p>

            <form className="login__form" onSubmit={handleSubmit} noValidate>
              {formError ? (
                <div className="login__alert" role="alert">
                  {formError}
                </div>
              ) : null}

              <div className="login__field">
                <label className="login__label" htmlFor="login-email">
                  E-mail
                </label>
                <input
                  id="login-email"
                  className={classNames('login__input', fieldErrors.email && 'login__input--invalid')}
                  type="email"
                  name="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="voce@email.com"
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                />
                {fieldErrors.email ? (
                  <p className="login__error" id="login-email-error">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="login__field">
                <label className="login__label" htmlFor="login-password">
                  Senha
                </label>
                <input
                  id="login-password"
                  className={classNames(
                    'login__input',
                    fieldErrors.password && 'login__input--invalid',
                  )}
                  type="password"
                  name="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                />
                {fieldErrors.password ? (
                  <p className="login__error" id="login-password-error">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              <div className="login__options">
                <label className="login__remember" htmlFor="login-remember">
                  <input
                    id="login-remember"
                    className="login__checkbox"
                    type="checkbox"
                    name="remember"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span className="login__remember-label">Lembrar de mim</span>
                </label>

                <Link className="login__link" to="/fale-conosco">
                  Esqueci minha senha
                </Link>
              </div>

              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <p className="login__footer">
              Ainda não tem conta?{' '}
              <Link className="login__link" to="/cadastro" state={location.state}>
                Criar conta
              </Link>
            </p>
          </div>
        </SectionCard>
      </div>
    </StoreLayout>
  );
}