/**
 * VELOX — Utilitários de navegação.
 */

/** Rotas de autenticação: nunca devem ser o destino de um redirecionamento pós-login. */
const AUTH_ROUTES = ['/login', '/cadastro'];

/**
 * Descobre para onde enviar o usuário depois de autenticar.
 *
 * Usa `state.from` (definido por guardas de rota, ex.: carrinho -> login) quando for
 * um caminho interno válido; caso contrário, volta para a Home.
 */
export function getRedirectPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return '/';
  }

  const from = (state as { from?: unknown }).from;

  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return '/';
  }

  const pathname = from.split(/[?#]/)[0];

  return AUTH_ROUTES.includes(pathname) ? '/' : from;
}