import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import type { RegisterInput } from '../../../services/authService';
import {
  EMAIL_PATTERN,
  formatCpfInput,
  formatPhoneInput,
  getTodayInputValue,
  onlyDigits,
} from '../../../utils/forms';
import { classNames } from '../../../utils/helpers';
import { getRedirectPath } from '../../../utils/navigation';
import './Cadastro.css';

/** Mesmo mínimo exigido pelo authService. */
const MIN_PASSWORD_LENGTH = 6;

type CadastroFormValues = RegisterInput & { confirmPassword: string };
type CadastroFieldName = keyof CadastroFormValues;
type CadastroFieldErrors = Partial<Record<CadastroFieldName, string>>;

const INITIAL_VALUES: CadastroFormValues = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  birthDate: '',
  password: '',
  confirmPassword: '',
};

function validateValues(values: CadastroFormValues): CadastroFieldErrors {
  const errors: CadastroFieldErrors = {};

  if (values.name.trim().split(/\s+/).filter(Boolean).length < 2) {
    errors.name = 'Informe o seu nome completo.';
  }

  if (!values.email.trim()) {
    errors.email = 'Informe o seu e-mail.';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (onlyDigits(values.cpf).length !== 11) {
    errors.cpf = 'Informe um CPF válido.';
  }

  const phoneDigits = onlyDigits(values.phone).length;

  if (phoneDigits < 10 || phoneDigits > 11) {
    errors.phone = 'Informe um telefone com DDD.';
  }

  if (!values.birthDate) {
    errors.birthDate = 'Informe a sua data de nascimento.';
  } else if (values.birthDate > getTodayInputValue()) {
    errors.birthDate = 'A data não pode estar no futuro.';
  }

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirme a sua senha.';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'As senhas não coincidem.';
  }

  return errors;
}

export function Cadastro() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const [values, setValues] = useState<CadastroFormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<CadastroFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const redirectPath = getRedirectPath(location.state);

  // Quem já está autenticado (inclusive logo após o cadastro) segue para o destino.
  if (!isLoading && isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  const updateField = (field: CadastroFieldName, value: string): void => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setFormError(null);
  };

  const handleTextChange =
    (field: CadastroFieldName) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      updateField(field, event.target.value);
    };

  const handleCpfChange = (event: ChangeEvent<HTMLInputElement>): void => {
    updateField('cpf', formatCpfInput(event.target.value));
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>): void => {
    updateField('phone', formatPhoneInput(event.target.value));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const errors = validateValues(values);
    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        name: values.name,
        email: values.email,
        cpf: values.cpf,
        phone: values.phone,
        birthDate: values.birthDate,
        password: values.password,
      });
      // O redirecionamento acontece pelo <Navigate> acima, assim que a conta é criada.
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Não foi possível criar a conta. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName = (field: CadastroFieldName): string =>
    classNames('cadastro__input', fieldErrors[field] && 'cadastro__input--invalid');

  const describedBy = (field: CadastroFieldName): string | undefined =>
    fieldErrors[field] ? `cadastro-${field}-error` : undefined;

  const renderError = (field: CadastroFieldName) =>
    fieldErrors[field] ? (
      <p className="cadastro__error" id={`cadastro-${field}-error`}>
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <StoreLayout>
      <div className="cadastro">
        <SectionCard
          className="cadastro__card"
          title={<span className="cadastro__title">Criar conta</span>}
        >
          <div className="cadastro__content">
            <p className="cadastro__subtitle">Leva menos de um minuto.</p>

            <form className="cadastro__form" onSubmit={handleSubmit} noValidate>
              {formError ? (
                <div className="cadastro__alert" role="alert">
                  {formError}
                </div>
              ) : null}

              <div className="cadastro__field">
                <label className="cadastro__label" htmlFor="cadastro-name">
                  Nome
                </label>
                <input
                  id="cadastro-name"
                  className={inputClassName('name')}
                  type="text"
                  name="name"
                  value={values.name}
                  onChange={handleTextChange('name')}
                  placeholder="Nome completo"
                  autoComplete="name"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={describedBy('name')}
                />
                {renderError('name')}
              </div>

              <div className="cadastro__field">
                <label className="cadastro__label" htmlFor="cadastro-email">
                  E-mail
                </label>
                <input
                  id="cadastro-email"
                  className={inputClassName('email')}
                  type="email"
                  name="email"
                  value={values.email}
                  onChange={handleTextChange('email')}
                  placeholder="voce@email.com"
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={describedBy('email')}
                />
                {renderError('email')}
              </div>

              <div className="cadastro__field">
                <label className="cadastro__label" htmlFor="cadastro-cpf">
                  CPF
                </label>
                <input
                  id="cadastro-cpf"
                  className={inputClassName('cpf')}
                  type="text"
                  name="cpf"
                  value={values.cpf}
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                  autoComplete="off"
                  aria-invalid={fieldErrors.cpf ? true : undefined}
                  aria-describedby={describedBy('cpf')}
                />
                {renderError('cpf')}
              </div>

              <div className="cadastro__row">
                <div className="cadastro__field">
                  <label className="cadastro__label" htmlFor="cadastro-phone">
                    Telefone
                  </label>
                  <input
                    id="cadastro-phone"
                    className={inputClassName('phone')}
                    type="tel"
                    name="phone"
                    value={values.phone}
                    onChange={handlePhoneChange}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    maxLength={15}
                    autoComplete="tel"
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    aria-describedby={describedBy('phone')}
                  />
                  {renderError('phone')}
                </div>

                <div className="cadastro__field">
                  <label className="cadastro__label" htmlFor="cadastro-birthDate">
                    Data de nascimento
                  </label>
                  <input
                    id="cadastro-birthDate"
                    className={inputClassName('birthDate')}
                    type="date"
                    name="birthDate"
                    value={values.birthDate}
                    onChange={handleTextChange('birthDate')}
                    max={getTodayInputValue()}
                    autoComplete="bday"
                    aria-invalid={fieldErrors.birthDate ? true : undefined}
                    aria-describedby={describedBy('birthDate')}
                  />
                  {renderError('birthDate')}
                </div>
              </div>

              <div className="cadastro__row">
                <div className="cadastro__field">
                  <label className="cadastro__label" htmlFor="cadastro-password">
                    Senha
                  </label>
                  <input
                    id="cadastro-password"
                    className={inputClassName('password')}
                    type="password"
                    name="password"
                    value={values.password}
                    onChange={handleTextChange('password')}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={describedBy('password')}
                  />
                  {renderError('password')}
                </div>

                <div className="cadastro__field">
                  <label className="cadastro__label" htmlFor="cadastro-confirmPassword">
                    Confirmar senha
                  </label>
                  <input
                    id="cadastro-confirmPassword"
                    className={inputClassName('confirmPassword')}
                    type="password"
                    name="confirmPassword"
                    value={values.confirmPassword}
                    onChange={handleTextChange('confirmPassword')}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                    aria-describedby={describedBy('confirmPassword')}
                  />
                  {renderError('confirmPassword')}
                </div>
              </div>

              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>

            <p className="cadastro__footer">
              Já tem uma conta?{' '}
              <Link className="cadastro__link" to="/login" state={location.state}>
                Entrar
              </Link>
            </p>
          </div>
        </SectionCard>
      </div>
    </StoreLayout>
  );
}