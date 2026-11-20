/**
 * VELOX — Admin / Login (rota "/admin/login").
 *
 * Página em tela cheia, FORA do AdminLayout (o layout redireciona para esta rota
 * quem não é administrador; usá-lo aqui causaria um loop de redirecionamento).
 *
 * - Autenticação: `loginAdmin` do AuthContext (aceita apenas usuários com role "admin").
 * - Após o login, volta para a página que o AdminLayout guardou em `location.state.from`
 *   (se for uma rota do painel); caso contrário, abre "/admin/produtos".
 * - "Lembrar de mim": guarda apenas o e-mail digitado (nunca a senha). A sessão em si é
 *   controlada pelo authService, que sempre a persiste.
 */

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import logoVelox from '../../../assets/images/Logo.png';
import { Button } from '../../../components/Ui/Button/Button';
import { useAuth } from '../../../context/AuthContext';
import {
  STORAGE_PREFIX,
  readStorage,
  removeStorage,
  writeStorage,
} from '../../../services/storage';
import './adminLogin.css';

const ADMIN_HOME_ROUTE = '/admin/produtos';
const ADMIN_LOGIN_ROUTE = '/admin/login';
const STORE_ROUTE = '/';

/** Chave do localStorage com o e-mail lembrado (apenas o e-mail). */
const REMEMBERED_EMAIL_KEY = `${STORAGE_PREFIX}admin-login-email`;

interface LoginLocationState {
  from?: string;
}

/** Só aceita voltar para rotas do painel (evita redirecionar para fora ou para o próprio login). */
function resolveRedirect(from: string | undefined): string {
  if (from && from.startsWith('/admin') && from !== ADMIN_LOGIN_ROUTE) {
    return from;
  }

  return ADMIN_HOME_ROUTE;
}

export function AdminLogin() {
  const { isAdmin, isLoading, loginAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState<string>(() =>
    readStorage<string>(REMEMBERED_EMAIL_KEY, () => ''),
  );
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotMessage, setShowForgotMessage] = useState(false);

  const locationState = location.state as LoginLocationState | null;
  const redirectTo = resolveRedirect(locationState ? locationState.from : undefined);

  // Aguarda a restauração da sessão antes de decidir qualquer coisa.
  if (isLoading) {
    return null;
  }

  // Administrador já autenticado não precisa ver o login.
  if (isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const trimmedEmail = email.trim();

      await loginAdmin(trimmedEmail, password);

      if (rememberMe) {
        writeStorage(REMEMBERED_EMAIL_KEY, trimmedEmail);
      } else {
        removeStorage(REMEMBERED_EMAIL_KEY);
      }

      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível entrar.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-login">
      {/* Painel esquerdo (marca) */}
      <section className="admin-login__brand" aria-label="VELOX Painel Administrativo">
        <div className="admin-login__brand-content">
          <img className="admin-login__logo" src={logoVelox} alt="VELOX — Periféricos que elevam seu jogo" />
          <p className="admin-login__badge">Painel administrativo</p>
          <p className="admin-login__tagline">Gerencie produtos, pedidos e clientes da loja</p>
        </div>
      </section>

      {/* Painel direito (formulário) */}
      <main className="admin-login__panel">
        <div className="admin-login__wrapper">
          <div className="admin-login__card">
            <header className="admin-login__card-header">
              <span className="admin-login__status-dot" aria-hidden="true" />
              <span className="admin-login__card-header-text">VELOX · Área administrativa</span>
            </header>

            <form
              className="admin-login__form"
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              <h1 className="admin-login__title">Acesso restrito</h1>

              <p className="admin-login__notice">
                <Lock className="admin-login__notice-icon" aria-hidden="true" />
                Área restrita para administradores
              </p>

              <div className="admin-login__field">
                <label className="admin-login__label" htmlFor="admin-login-email">
                  E-mail do administrador
                </label>
                <input
                  id="admin-login-email"
                  type="email"
                  className="admin-login__input"
                  placeholder="admin@velox.com.br"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-login__field">
                <label className="admin-login__label" htmlFor="admin-login-password">
                  Senha
                </label>
                <input
                  id="admin-login-password"
                  type="password"
                  className="admin-login__input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-login__options">
                <label className="admin-login__remember" htmlFor="admin-login-remember">
                  <input
                    id="admin-login-remember"
                    type="checkbox"
                    className="admin-login__checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  Lembrar de mim
                </label>

                <button
                  type="button"
                  className="admin-login__link-button"
                  onClick={() => setShowForgotMessage(true)}
                >
                  Esqueci minha senha
                </button>
              </div>

              {showForgotMessage && (
                <p className="admin-login__message admin-login__message--info" role="status">
                  A redefinição de senha ainda não está disponível. Fale com o suporte VELOX.
                </p>
              )}

              {errorMessage && (
                <p className="admin-login__message admin-login__message--error" role="alert">
                  {errorMessage}
                </p>
              )}

              <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </div>

          <p className="admin-login__back">
            Não é administrador?{' '}
            <Link className="admin-login__back-link" to={STORE_ROUTE}>
              Voltar para a loja
            </Link>
          </p>
        </div>

        <footer className="admin-login__footer">
          © {new Date().getFullYear()} Velox — Painel Administrativo
        </footer>
      </main>
    </div>
  );
}

export default AdminLogin;