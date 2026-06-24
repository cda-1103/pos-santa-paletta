import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import PaymentModal from '../components/PaymentModal';
import CloseShiftModal from '../components/CloseShiftModal';
import ReceiptModal from '../components/ReceiptModal';
import SidebarMenu from '../components/SidebarMenu';

export default function POS() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [activeShift, setActiveShift] = useState(null);

  const [baseUsd, setBaseUsd] = useState('0.00');
  const [baseBs, setBaseBs] = useState('0.00');
  const [basePm, setBasePm] = useState('0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState(null);
  
  // ESTADO DEL MENÚ
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { items, tasaCambio, getTotalUsd, getTotalBs, fetchSettings, addItem, updateQuantity, removeItem } = useCartStore();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    checkActiveShift();
    fetchSettings();
  }, [user, fetchSettings]);

  useEffect(() => {
    if (activeShift) loadCatalog();
  }, [activeShift]);

  const checkActiveShift = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('cash_shifts').select('*').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      setActiveShift(data);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const [catsRes, prodsRes] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('products').select('*, categories(nombre)')
      ]);
      if (!catsRes.error) setCategories(catsRes.data);
      if (!prodsRes.error) setProducts(prodsRes.data);
    } catch (error) {
      console.error(error.message);
    }
  };

  const handleOpenShift = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.from('cash_shifts').insert([{ usuario_id: user.id, base_usd_efectivo: parseFloat(baseUsd), base_bs_efectivo: parseFloat(baseBs), base_pm: parseFloat(basePm), estado: 'abierta' }]).select().single();
      if (error) throw error;
      setActiveShift(data);
    } catch (error) {
      alert('Hubo un error al abrir la caja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.nombre.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? product.categoria_id === selectedCategory : true;
    const hasStock = product.stock_actual > 0; 
    return matchesSearch && matchesCategory && hasStock;
  });

  const totalItemsEnCarrito = items.reduce((acc, item) => acc + item.cantidad, 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500 font-medium">Verificando caja...</p></div>;

  if (!activeShift) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 relative">
        <SidebarMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        <button onClick={() => setIsMenuOpen(true)} className="absolute top-4 left-4 p-3 bg-white shadow-md rounded-xl text-xl hover:bg-gray-100">☰</button>
        
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Apertura de Caja</h2>
          <form onSubmit={handleOpenShift} className="space-y-5 mt-6">
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Efectivo USD ($)</label><input type="number" step="0.01" required className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={baseUsd} onChange={(e) => setBaseUsd(e.target.value)} /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Efectivo Bs</label><input type="number" step="0.01" required className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={baseBs} onChange={(e) => setBaseBs(e.target.value)} /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Saldo Pago Móvil</label><input type="number" step="0.01" required className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={basePm} onChange={(e) => setBasePm(e.target.value)} /></div>
            <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold">Iniciar Turno</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex justify-between items-center shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-lg">☰</button>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-widest hidden sm:block">Santa Paletta</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block text-sm font-bold bg-gray-100 text-gray-700 px-3 py-1 rounded-full border border-gray-200">Tasa: {tasaCambio.toFixed(2)} Bs</span>
          <button onClick={() => setIsCloseModalOpen(true)} className="text-sm font-bold px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-md">Cerrar Caja (Z)</button>
        </div>
      </header>
      
      <main className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col h-full bg-gray-50">
          <div className="bg-white px-4 lg:px-6 pt-4 pb-2 border-b border-gray-200 shrink-0 shadow-sm z-10">
            <input type="text" placeholder="Buscar producto..." className="w-full px-4 py-3 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:border-gray-900 focus:ring-2 focus:ring-gray-900 transition-all mb-4" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar -mx-2 px-2">
              <button onClick={() => setSelectedCategory('')} className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all ${selectedCategory === '' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>Todas</button>
              {categories.map(cat => <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all ${selectedCategory === cat.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{cat.nombre}</button>)}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400"><span className="text-4xl mb-2">🔍</span><p>No hay productos disponibles.</p></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
                {filteredProducts.map(product => (
                  <div key={product.id} onClick={() => addItem(product)} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between h-full active:scale-95 transition-all">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase">{product.categories?.nombre}</p>
                        <span className="text-[10px] font-black bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">{product.stock_actual} disp.</span>
                      </div>
                      <h3 className="font-bold text-gray-800 leading-tight mb-2">{product.nombre}</h3>
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <p className="text-lg font-black text-gray-900">{product.precio_usd.toFixed(2)}$</p>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 font-bold hover:bg-gray-200">+</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div><p className="text-xs font-semibold text-gray-500 uppercase">Total a cobrar</p><p className="text-xl font-black text-gray-900">{getTotalUsd().toFixed(2)} $</p></div>
          <button onClick={() => setShowMobileCart(true)} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md"><span>Orden</span>{totalItemsEnCarrito > 0 && <span className="bg-white text-gray-900 text-xs py-0.5 px-2 rounded-full font-black">{totalItemsEnCarrito}</span>}</button>
        </div>

        <div className={`${showMobileCart ? 'fixed inset-0 z-40 flex' : 'hidden'} lg:static lg:flex w-full lg:w-[420px] bg-white flex-col shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] lg:border-l border-gray-200 transition-all`}>
          <div className="p-4 lg:p-6 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
            <div><h2 className="text-lg font-black text-gray-900">Orden Actual</h2><p className="text-sm text-gray-500 font-medium">{totalItemsEnCarrito} artículos</p></div>
            <button onClick={() => setShowMobileCart(false)} className="lg:hidden w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold">&times;</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50 lg:bg-white">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400"><div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-2xl">🛒</div><p className="font-medium">Agrega productos a la orden</p></div>
            ) : (
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-900 truncate mb-1">{item.nombre}</p><p className="text-sm font-semibold text-gray-500">{(item.precio_usd * item.cantidad).toFixed(2)}$</p></div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-gray-100 rounded-lg p-1 shrink-0">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 bg-white rounded shadow-sm text-gray-800 font-bold">-</button>
                        <span className="w-8 text-center text-sm font-black">{item.cantidad}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 bg-white rounded shadow-sm text-gray-800 font-bold">+</button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="w-9 h-9 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 lg:p-6 border-t border-gray-100 bg-white shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.02)]">
            <div className="space-y-2 mb-6">
              <div className="flex justify-between items-center text-gray-600"><span className="font-medium">Subtotal USD</span><span className="font-semibold text-lg text-gray-900">{getTotalUsd().toFixed(2)} $</span></div>
              <div className="flex justify-between items-center text-gray-500"><span className="text-sm font-medium">Equivalente Bs</span><span className="text-sm font-bold">{getTotalBs().toFixed(2)} Bs</span></div>
            </div>
            <button disabled={items.length === 0} onClick={() => setIsPaymentModalOpen(true)} className="w-full py-4 bg-green-600 text-white rounded-xl font-black text-lg shadow-md hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors">Procesar Pago</button>
          </div>
        </div>
      </main>

      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} activeShiftId={activeShift?.id} onSuccess={(saleId) => { setShowMobileCart(false); setReceiptSaleId(saleId); loadCatalog(); }} />
      <CloseShiftModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} activeShift={activeShift} onSuccess={() => { alert('Turno cerrado.'); setActiveShift(null); }} />
      <ReceiptModal isOpen={!!receiptSaleId} saleId={receiptSaleId} onClose={() => setReceiptSaleId(null)} />
      <SidebarMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </div>
  );
}