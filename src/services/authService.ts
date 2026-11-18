/**
 * VELOX — Serviço de autenticação e contas.
 *
 * Login/cadastro de cliente, login de administrador, dados cadastrais, senha,
 * endereços e bloqueio/desbloqueio de clientes (admin).
 *
 * Todos os métodos retornam Promise<T> e persistem no localStorage. Ao integrar
 * o back-end Node.js + MySQL, troque o corpo das funções por `fetch()`.
 *
 * ATENÇÃO: o hash de senha usado aqui é apenas um mock didático e NÃO é seguro.
 * No back-end real, use bcrypt/argon2 e tokens JWT.
 *
 * Credenciais iniciais (seed):
 * - Administrador: admin@velox.com.br / admin123
 * - Clientes do mockData: senha velox123
 */

import {
  orders as seedOrders,
  userAddresses as seedAddresses,
  users as seedUsers,
} from '../data/mockData';
import type { Order, User, UserAddress } from '../types';
import { normalizeText, removeUndefined } from '../utils/helpers';
import {
  STORAGE_KEYS,
  generateNextId,
  readStorage,
  removeStorage,
  writeStorage,
} from './storage';

/* ==========================================================================
   Tipos
   ========================================================================== */

/** Tabela: user_credentials (1:1 com users). Nunca exposta à interface. */
export interface UserCredential {
  userId: number;
  passwordHash: string;
}

export interface AuthSession {
  user: User;
  token: string;
}

interface StoredSession {
  userId: number;
  token: string;
  createdAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: string;
  password: string;
}

export type UpdateProfileInput = Partial<Pick<User, 'name' | 'email' | 'phone' | 'birthDate'>>;

export type AddressInput = Omit<UserAddress, 'id' | 'userId'>;

export interface CustomerQuery {
  search?: string;
  isActive?: boolean;
}

/* ==========================================================================
   Constantes
   ========================================================================== */

const DEMO_ADMIN_PASSWORD = 'admin123';
const DEMO_CUSTOMER_PASSWORD = 'velox123';
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ==========================================================================
   Funções internas
   ========================================================================== */

/** Hash determinístico apenas para o mock (cyrb53 com sal). Não use em produção. */
function hashPassword(password: string): string {
  const salted = `velox::${password}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < salted.length; index += 1) {
    const code = salted.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');

  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  for (let length = 9; length < 11; length += 1) {
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }

    const checkDigit = ((sum * 10) % 11) % 10;

    if (checkDigit !== Number(digits[length])) {
      return false;
    }
  }

  return true;
}

function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatZipCode(zipCode: string): string {
  const digits = zipCode.replace(/\D/g, '');

  if (digits.length !== 8) {
    throw new Error('Informe um CEP válido com 8 dígitos.');
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeBirthDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Informe uma data de nascimento válida.');
  }

  if (date.getTime() > Date.now()) {
    throw new Error('A data de nascimento não pode estar no futuro.');
  }

  return date.toISOString();
}

function assertValidPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Informe um e-mail válido.');
  }
}

/* --------------------------------------------------------------------------
   Acesso ao storage (seed automático a partir do mockData)
   -------------------------------------------------------------------------- */

const loadUsers = (): User[] => readStorage<User[]>(STORAGE_KEYS.users, () => seedUsers);
const saveUsers = (value: User[]): void => writeStorage(STORAGE_KEYS.users, value);

const loadAddresses = (): UserAddress[] =>
  readStorage<UserAddress[]>(STORAGE_KEYS.addresses, () => seedAddresses);
const saveAddresses = (value: UserAddress[]): void => writeStorage(STORAGE_KEYS.addresses, value);

const loadCredentials = (): UserCredential[] =>
  readStorage<UserCredential[]>(STORAGE_KEYS.credentials, () =>
    seedUsers.map((user) => ({
      userId: user.id,
      passwordHash: hashPassword(
        user.role === 'admin' ? DEMO_ADMIN_PASSWORD : DEMO_CUSTOMER_PASSWORD,
      ),
    })),
  );
const saveCredentials = (value: UserCredential[]): void =>
  writeStorage(STORAGE_KEYS.credentials, value);

const loadOrders = (): Order[] => readStorage<Order[]>(STORAGE_KEYS.orders, () => seedOrders);

const loadSession = (): StoredSession | null =>
  readStorage<StoredSession | null>(STORAGE_KEYS.session, () => null);

function createSession(user: User): AuthSession {
  const token = `velox-mock-token-${user.id}-${Date.now().toString(36)}`;
  const session: StoredSession = {
    userId: user.id,
    token,
    createdAt: new Date().toISOString(),
  };

  writeStorage(STORAGE_KEYS.session, session);
  return { user, token };
}

async function authenticate(
  email: string,
  password: string,
  role: User['role'],
): Promise<AuthSession> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    throw new Error('Informe e-mail e senha.');
  }

  const user = loadUsers().find(
    (item) => normalizeEmail(item.email) === normalizedEmail && item.role === role,
  );
  const credential = user
    ? loadCredentials().find((item) => item.userId === user.id)
    : undefined;

  if (!user || !credential || credential.passwordHash !== hashPassword(password)) {
    throw new Error('E-mail ou senha inválidos.');
  }

  if (!user.isActive) {
    throw new Error('Esta conta está bloqueada. Entre em contato com o suporte VELOX.');
  }

  return createSession(user);
}

function normalizeAddress(input: AddressInput): AddressInput {
  const recipientName = input.recipientName.trim();
  const street = input.street.trim();
  const number = input.number.trim();
  const neighborhood = input.neighborhood.trim();
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  const complement = input.complement && input.complement.trim() ? input.complement.trim() : null;

  if (!recipientName || !street || !number || !neighborhood || !city) {
    throw new Error('Preencha todos os campos obrigatórios do endereço.');
  }

  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error('Informe a sigla do estado com 2 letras (ex.: SP).');
  }

  return {
    label: input.label.trim() || 'Endereço',
    recipientName,
    zipCode: formatZipCode(input.zipCode),
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    isDefault: input.isDefault,
  };
}

function toAddressInput(address: UserAddress): AddressInput {
  return {
    label: address.label,
    recipientName: address.recipientName,
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    isDefault: address.isDefault,
  };
}

/* ==========================================================================
   Sessão, login e cadastro
   ========================================================================== */

/** Login de cliente. */
export async function loginCustomer(email: string, password: string): Promise<AuthSession> {
  return authenticate(email, password, 'customer');
}

/** Login do administrador (ex.: admin@velox.com.br). */
export async function loginAdmin(email: string, password: string): Promise<AuthSession> {
  return authenticate(email, password, 'admin');
}

/** Cadastra um novo cliente e já abre a sessão. */
export async function registerCustomer(input: RegisterInput): Promise<AuthSession> {
  const users = loadUsers();
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim();

  if (!name) {
    throw new Error('Informe o seu nome.');
  }

  assertValidEmail(email);

  if (!isValidCpf(input.cpf)) {
    throw new Error('Informe um CPF válido.');
  }

  if (!phone) {
    throw new Error('Informe o seu telefone.');
  }

  assertValidPassword(input.password);

  const birthDate = normalizeBirthDate(input.birthDate);
  const cpf = formatCpf(input.cpf);

  if (users.some((user) => normalizeEmail(user.email) === email)) {
    throw new Error('Já existe uma conta com este e-mail.');
  }

  if (users.some((user) => user.cpf === cpf)) {
    throw new Error('Já existe uma conta com este CPF.');
  }

  const user: User = {
    id: generateNextId(users),
    name,
    email,
    cpf,
    phone,
    birthDate,
    role: 'customer',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  saveUsers([...users, user]);
  saveCredentials([
    ...loadCredentials(),
    { userId: user.id, passwordHash: hashPassword(input.password) },
  ]);

  return createSession(user);
}

/** Encerra a sessão atual. */
export async function logout(): Promise<void> {
  removeStorage(STORAGE_KEYS.session);
}

/** Restaura o usuário da sessão salva (ou null se não houver / conta bloqueada). */
export async function getCurrentUser(): Promise<User | null> {
  const session = loadSession();

  if (!session) {
    return null;
  }

  const user = loadUsers().find((item) => item.id === session.userId);

  if (!user || !user.isActive) {
    removeStorage(STORAGE_KEYS.session);
    return null;
  }

  return user;
}

export async function getUserById(userId: number): Promise<User | null> {
  return loadUsers().find((user) => user.id === userId) ?? null;
}

/** Busca vários usuários de uma vez (uso no admin, ex.: nome do cliente em cada pedido). */
export async function getUsersByIds(userIds: number[]): Promise<User[]> {
  const ids = new Set(userIds);
  return loadUsers().filter((user) => ids.has(user.id));
}

/** Nomes públicos (ex.: "Rafael A.") para exibir autores de avaliações sem expor dados pessoais. */
export async function getUserDisplayNames(userIds: number[]): Promise<Record<number, string>> {
  const ids = new Set(userIds);
  const names: Record<number, string> = {};

  loadUsers()
    .filter((user) => ids.has(user.id))
    .forEach((user) => {
      const parts = user.name.trim().split(/\s+/);
      const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : '';
      names[user.id] = `${parts[0]}${lastInitial}`;
    });

  return names;
}

/* ==========================================================================
   Dados cadastrais e senha
   ========================================================================== */

export async function updateProfile(userId: number, input: UpdateProfileInput): Promise<User> {
  const users = loadUsers();
  const index = users.findIndex((user) => user.id === userId);

  if (index === -1) {
    throw new Error('Usuário não encontrado.');
  }

  const fields = removeUndefined(input);
  const updated: User = { ...users[index], ...fields, id: userId };

  updated.name = updated.name.trim();
  updated.phone = updated.phone.trim();
  updated.email = normalizeEmail(updated.email);

  if (!updated.name) {
    throw new Error('Informe o seu nome.');
  }

  if (!updated.phone) {
    throw new Error('Informe o seu telefone.');
  }

  assertValidEmail(updated.email);

  if (fields.birthDate !== undefined) {
    updated.birthDate = normalizeBirthDate(fields.birthDate);
  }

  if (users.some((user) => user.id !== userId && normalizeEmail(user.email) === updated.email)) {
    throw new Error('Já existe uma conta com este e-mail.');
  }

  users[index] = updated;
  saveUsers(users);
  return updated;
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const credentials = loadCredentials();
  const index = credentials.findIndex((credential) => credential.userId === userId);

  if (index === -1) {
    throw new Error('Usuário não encontrado.');
  }

  if (credentials[index].passwordHash !== hashPassword(currentPassword)) {
    throw new Error('A senha atual está incorreta.');
  }

  assertValidPassword(newPassword);

  if (currentPassword === newPassword) {
    throw new Error('A nova senha deve ser diferente da senha atual.');
  }

  credentials[index] = { ...credentials[index], passwordHash: hashPassword(newPassword) };
  saveCredentials(credentials);
}

/* ==========================================================================
   Endereços
   ========================================================================== */

/** Endereços do usuário, com o padrão primeiro. */
export async function getAddressesByUser(userId: number): Promise<UserAddress[]> {
  return loadAddresses()
    .filter((address) => address.userId === userId)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id);
}

export async function getAddressById(addressId: number): Promise<UserAddress | null> {
  return loadAddresses().find((address) => address.id === addressId) ?? null;
}

export async function addAddress(userId: number, input: AddressInput): Promise<UserAddress> {
  const addresses = loadAddresses();
  const normalized = normalizeAddress(input);
  const isFirstAddress = !addresses.some((address) => address.userId === userId);
  const isDefault = isFirstAddress || normalized.isDefault;

  const address: UserAddress = {
    ...normalized,
    id: generateNextId(addresses),
    userId,
    isDefault,
  };

  const next = isDefault
    ? addresses.map((item) => (item.userId === userId ? { ...item, isDefault: false } : item))
    : addresses;

  saveAddresses([...next, address]);
  return address;
}

export async function updateAddress(
  userId: number,
  addressId: number,
  input: Partial<AddressInput>,
): Promise<UserAddress> {
  const addresses = loadAddresses();
  const index = addresses.findIndex(
    (address) => address.id === addressId && address.userId === userId,
  );

  if (index === -1) {
    throw new Error('Endereço não encontrado.');
  }

  const current = addresses[index];
  const normalized = normalizeAddress({ ...toAddressInput(current), ...removeUndefined(input) });

  // O endereço padrão só deixa de ser padrão quando outro endereço é definido como padrão.
  const isDefault = normalized.isDefault || current.isDefault;
  const updated: UserAddress = { ...normalized, id: addressId, userId, isDefault };

  const next = addresses.map((item) => {
    if (item.id === addressId) {
      return updated;
    }

    return isDefault && item.userId === userId ? { ...item, isDefault: false } : item;
  });

  saveAddresses(next);
  return updated;
}

/** Bloqueia a exclusão de endereços vinculados a pedidos (como um ON DELETE RESTRICT). */
export async function deleteAddress(userId: number, addressId: number): Promise<void> {
  const addresses = loadAddresses();
  const address = addresses.find((item) => item.id === addressId && item.userId === userId);

  if (!address) {
    throw new Error('Endereço não encontrado.');
  }

  if (loadOrders().some((order) => order.addressId === addressId)) {
    throw new Error('Este endereço está vinculado a pedidos e não pode ser excluído.');
  }

  const remaining = addresses.filter((item) => item.id !== addressId);

  if (address.isDefault) {
    const nextDefault = remaining.find((item) => item.userId === userId);

    if (nextDefault) {
      saveAddresses(
        remaining.map((item) => (item.id === nextDefault.id ? { ...item, isDefault: true } : item)),
      );
      return;
    }
  }

  saveAddresses(remaining);
}

export async function setDefaultAddress(userId: number, addressId: number): Promise<UserAddress> {
  const addresses = loadAddresses();

  if (!addresses.some((address) => address.id === addressId && address.userId === userId)) {
    throw new Error('Endereço não encontrado.');
  }

  const next = addresses.map((address) =>
    address.userId === userId ? { ...address, isDefault: address.id === addressId } : address,
  );

  saveAddresses(next);
  return next.find((address) => address.id === addressId) as UserAddress;
}

/* ==========================================================================
   Administração de clientes
   ========================================================================== */

/** Lista clientes (admin), com busca por nome, e-mail, CPF ou telefone. */
export async function getCustomers(query: CustomerQuery = {}): Promise<User[]> {
  const normalizedSearch = query.search ? normalizeText(query.search) : '';

  return loadUsers()
    .filter((user) => {
      if (user.role !== 'customer') {
        return false;
      }

      if (query.isActive !== undefined && user.isActive !== query.isActive) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = normalizeText(`${user.name} ${user.email} ${user.cpf} ${user.phone}`);
        return haystack.includes(normalizedSearch);
      }

      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function setCustomerActiveStatus(userId: number, isActive: boolean): Promise<User> {
  const users = loadUsers();
  const index = users.findIndex((user) => user.id === userId);

  if (index === -1) {
    throw new Error('Cliente não encontrado.');
  }

  if (users[index].role !== 'customer') {
    throw new Error('Apenas contas de clientes podem ser bloqueadas ou desbloqueadas.');
  }

  users[index] = { ...users[index], isActive };
  saveUsers(users);
  return users[index];
}

export async function blockCustomer(userId: number): Promise<User> {
  return setCustomerActiveStatus(userId, false);
}

export async function unblockCustomer(userId: number): Promise<User> {
  return setCustomerActiveStatus(userId, true);
}
