import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Spinner } from "./components/ui";
import { CONFIGURED } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { StoreProvider } from "./lib/store";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import { About, Contact, NotConfigured, NotFoundPage, Policy } from "./pages/Info";
import OrderConfirmation from "./pages/OrderConfirmation";
import Product from "./pages/Product";
import Shop from "./pages/Shop";

// The admin area is loaded only when someone visits /admin, keeping the store fast.
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  if (!CONFIGURED) return <NotConfigured />;
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <StoreProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <Routes>
                <Route path="/admin/*" element={<Suspense fallback={<Spinner label="Loading admin" />}><AdminApp /></Suspense>} />
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="category/:slug" element={<Shop />} />
                  <Route path="product/:slug" element={<Product />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="order/:number" element={<OrderConfirmation />} />
                  <Route path="policies/:key" element={<Policy />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="about" element={<About />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </StoreProvider>
    </BrowserRouter>
  );
}
