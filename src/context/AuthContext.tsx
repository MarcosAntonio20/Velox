/**
 * VELOX — Contexto de autenticação.
 *
 * Mantém o usuário logado (cliente ou administrador), seus endereços e as
 * ações de conta. A sessão é persistida pelo authService (localStorage) e
 * restaurada automaticamente ao abrir a aplicação.
 *
 * Ordem dos providers: AuthProvider deve envolver CartProvider e WishlistProvider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addAddress as addAddressRequest,
  changePassword as changePasswordRequest,
  deleteAddress as deleteAddressRequest,
  getAddressesByUser,
  getCurrentUser,
  loginAdmin as loginAdminRequest,
  loginCustomer as loginCustomerRequest,
  logout as logoutRequest,
  registerCustomer as registerCustomerRequest,
  setDefaultAddress as setDefaultAddressRequest,
  updateAddress as updateAddressRequest,
  updateProfile as updateProfileRequest,
  type AddressInput,
  type RegisterInput,
  type UpdateProfileInput,
} from '../services/authService';
import type { User, UserAddress } from '../types';

interface AddressState {
  ownerId: number | null;
  items: UserAddress[];
}

export interface AuthContextValue {
  user: User | null;
  addresses: UserAddress[];
  /** true enquanto a sessão salva está sendo restaurada na abertura da aplicação. */
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginAdmin: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  addAddress: (input: AddressInput) => Promise<UserAddress>;
  updateAddress: (addressId: number, input: Partial<AddressInput>) => Promise<UserAddress>;
  removeAddress: (addressId: number) => Promise<void>;
  setDefaultAddress: (addressId: number) => Promise<void>;
  refreshAddresses: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [addressState, setAddressState] = useState<AddressState>({ ownerId: null, items: [] });

  const userId = user ? user.id : null;

  // Restaura a sessão salva ao abrir a aplicação.
  useEffect(() => {
    let isCancelled = false;

    getCurrentUser()
      .then((currentUser) => {
        if (!isCancelled) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Carrega os endereços sempre que o usuário logado muda.
  useEffect(() => {
    if (userId === null) {
      return;
    }

    let isCancelled = false;

    getAddressesByUser(userId)
      .then((items) => {
        if (!isCancelled) {
          setAddressState({ ownerId: userId, items });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setAddressState({ ownerId: userId, items: [] });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [userId]);

  // Endereços só valem para o usuário atual (evita mostrar dados do usuário anterior).
  const addresses = useMemo<UserAddress[]>(
    () => (userId !== null && addressState.ownerId === userId ? addressState.items : []),
    [userId, addressState],
  );

  const reloadAddresses = useCallback(async (ownerId: number): Promise<void> => {
    const items = await getAddressesByUser(ownerId);
    setAddressState({ ownerId, items });
  }, []);

  const requireUserId = useCallback((): number => {
    if (userId === null) {
      throw new Error('Faça login para continuar.');
    }

    return userId;
  }, [userId]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const session = await loginCustomerRequest(email, password);
    setUser(session.user);
    return session.user;
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string): Promise<User> => {
    const session = await loginAdminRequest(email, password);
    setUser(session.user);
    return session.user;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<User> => {
    const session = await registerCustomerRequest(input);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await logoutRequest();
    setUser(null);
    setAddressState({ ownerId: null, items: [] });
  }, []);

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<User> => {
      const updatedUser = await updateProfileRequest(requireUserId(), input);
      setUser(updatedUser);
      return updatedUser;
    },
    [requireUserId],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      await changePasswordRequest(requireUserId(), currentPassword, newPassword);
    },
    [requireUserId],
  );

  const addAddress = useCallback(
    async (input: AddressInput): Promise<UserAddress> => {
      const ownerId = requireUserId();
      const address = await addAddressRequest(ownerId, input);
      await reloadAddresses(ownerId);
      return address;
    },
    [requireUserId, reloadAddresses],
  );

  const updateAddress = useCallback(
    async (addressId: number, input: Partial<AddressInput>): Promise<UserAddress> => {
      const ownerId = requireUserId();
      const address = await updateAddressRequest(ownerId, addressId, input);
      await reloadAddresses(ownerId);
      return address;
    },
    [requireUserId, reloadAddresses],
  );

  const removeAddress = useCallback(
    async (addressId: number): Promise<void> => {
      const ownerId = requireUserId();
      await deleteAddressRequest(ownerId, addressId);
      await reloadAddresses(ownerId);
    },
    [requireUserId, reloadAddresses],
  );

  const setDefaultAddress = useCallback(
    async (addressId: number): Promise<void> => {
      const ownerId = requireUserId();
      await setDefaultAddressRequest(ownerId, addressId);
      await reloadAddresses(ownerId);
    },
    [requireUserId, reloadAddresses],
  );

  const refreshAddresses = useCallback(async (): Promise<void> => {
    await reloadAddresses(requireUserId());
  }, [requireUserId, reloadAddresses]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      addresses,
      isLoading,
      isAuthenticated: user !== null,
      isAdmin: user !== null && user.role === 'admin',
      login,
      loginAdmin,
      register,
      logout,
      updateProfile,
      changePassword,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      refreshAddresses,
    }),
    [
      user,
      addresses,
      isLoading,
      login,
      loginAdmin,
      register,
      logout,
      updateProfile,
      changePassword,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      refreshAddresses,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }

  return context;
}
