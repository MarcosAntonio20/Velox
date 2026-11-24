import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

// Rotas de usuario
import { Home } from './pages/Store/home/home';
import { Catalogo } from './pages/Store/catalogo/catalogo';
import { Busca } from './pages/Store/busca/busca';
import { Produto } from './pages/Store/produto/produto';
import { ListaDeDesejos } from './pages/Store/ListaDeDesejos/ListaDeDesejos';
import { Checkout} from './pages/Store/checkout/checkout'

// Rotas de administrador
import { AdminLayout } from './layouts/AdminLayout/AdminLayout';
import { Produtos as AdminProdutos } from './pages/Admin/Produto/produto';
import { ProdutoForm } from './pages/Admin/ProdutoForm/produtoForm';
import { AdminLogin } from './pages/Admin/AdminLogin/adminLogin';
import { AdminCategorias } from './pages/Admin/Categorias/adminCategorias';
import { AdminEstoque } from './pages/Admin/Estoque/adminEstoque';
import { AdminCupons } from './pages/Admin/Cupons/adminCupons';
import { AdminBanners } from './pages/Admin/Banners/adminBanners';
import { AvaliacoesAdmin } from './pages/Admin/Avaliacoes/avaliacoesAdmin';
import { PedidosAdmin } from './pages/Admin/Pedidos/pedidosAdmin';
import { ClientesAdmin } from './pages/Admin/Clientes/clientesAdmin';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalogo" element={<Catalogo />} />
              <Route path="/busca" element={<Busca />} />
              <Route path="/produto/:slug" element={<Produto />} />
              <Route path="/ListaDeDesejos" element={<ListaDeDesejos />} />
              <Route path="/checkout" element={<Checkout />} />

              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="produtos" element={<AdminProdutos />} />
                <Route path="produtos/novo" element={<ProdutoForm />} />
                <Route path="produtos/:id/editar" element={<ProdutoForm />} />
                 <Route path="categorias" element={<AdminCategorias />} />
                 <Route path="estoque" element={<AdminEstoque />} />
                 <Route path="cupons" element={<AdminCupons />} />
                 <Route path="banners" element={<AdminBanners />} />
                 <Route path="avaliacoes" element={<AvaliacoesAdmin />} />
                 <Route path="pedidos" element={<PedidosAdmin />} />
                 <Route path="clientes" element={<ClientesAdmin />} />
              </Route>

              {/* Evita tela branca se você clicar em um link ainda não criado */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;