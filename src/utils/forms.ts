/**
 * VELOX — Utilitários de formulário (máscaras e validações simples de campo).
 */

/** Mesmo padrão de e-mail usado pelo authService. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mantém apenas os dígitos de um texto. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Máscara de CPF enquanto o usuário digita: 000.000.000-00. */
export function formatCpfInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Máscara de telefone brasileiro: (00) 0000-0000 ou (00) 00000-0000. */
export function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length === 0) {
    return '';
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Data de hoje (fuso local) no formato YYYY-MM-DD, usada como `max` de input type="date". */
export function getTodayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}