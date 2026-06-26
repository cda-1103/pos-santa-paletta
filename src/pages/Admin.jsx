import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import SidebarMenu from '../components/SidebarMenu';

export default function Admin() {
  const { profile, user, signOut } = useAuthStore();
  const [activeTab, setActiveTab] = useState('reportes'); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [loadingData, setLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [settings, setSettings] = useState({ tasa_bcv: '', tasa_personalizada: '', usar_tasa_personalizada: false });
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState({ nombre: '', categoria_id: '', precio_usd: '' });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ nombre: '', moneda: 'VES', requiere_referencia: false, activo: true });
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [transactionForm, setTransactionForm] = useState({ producto_id: '', tipo: 'ingreso', cantidad: '', descripcion: '', numero_orden: '' });

  const [salesRecord, setSalesRecord] = useState([]);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoadingData(true);
    await Promise.all([ fetchSettings(), fetchCatalog(), fetchPaymentMethods(), fetchInventoryHistory(), fetchSalesRecord() ]);
    setLoadingData(false);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').single();
    if (data) setSettings(data);
  };

  const fetchBcvFromApi = async () => {
    setIsFetchingApi(true);
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      const data = await response.json();
      if (data && data.promedio) {
        setSettings(prev => ({ ...prev, tasa_bcv: data.promedio.toString() }));
      }
    } catch (error) {
      alert('Error consultando API BCV.');
    } finally { setIsFetchingApi(false); }
  };

  const fetchCatalog = async () => {
    const [catsRes, prodsRes] = await Promise.all([
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('products').select('*, categories(nombre)').order('created_at', { ascending: false })
    ]);
    if (catsRes.data) setCategories(catsRes.data);
    if (prodsRes.data) setProducts(prodsRes.data);
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').order('nombre', { ascending: true });
    if (data) setPaymentMethods(data);
  };

  const fetchInventoryHistory = async () => {
    const { data } = await supabase.from('inventory_transactions').select('*, products(nombre)').order('created_at', { ascending: false }).limit(50);
    if (data) setInventoryHistory(data);
  };

  // SISTEMA DE ALERTAS EN CASO DE ERROR DE BD
const fetchSalesRecord = async () => {
    // Especificamos claramente las relaciones evitando el comodín (*)
    const { data, error } = await supabase
      .from('sales')
      .select(`
        id, 
        created_at, 
        total_usd, 
        tasa_cambio_aplicada,
        correlativo,
        cash_shifts!sales_turno_id_fkey(usuario_id, profiles(nombre)),
        payments:payments_venta_id_fkey(monto_pagado, moneda_pago, referencia, payment_methods(nombre))
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error:", error);
      alert("Error en la consulta: " + error.message);
    } else {
      setSalesRecord(data || []);
    }
  };

  const handleOpenSaleDetails = async (sale) => {
    setIsLoadingDetails(true);
    setSelectedSaleDetails(sale); 
    try {
      const [itemsRes, paymentsRes] = await Promise.all([
        supabase.from('sale_items').select('*, products(nombre)').eq('venta_id', sale.id),
        supabase.from('payments').select('*, payment_methods(nombre)').eq('venta_id', sale.id)
      ]);
      setSelectedSaleDetails({ ...sale, items: itemsRes.data || [], payments: paymentsRes.data || [] });
    } catch (error) {
      console.error(error);
    } finally { setIsLoadingDetails(false); }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm('⚠️ ¿Estás seguro de eliminar esta venta?\n\nEl dinero se descontará y el stock regresará al inventario.')) return;
    try {
      await supabase.from('payments').delete().eq('venta_id', saleId);
      await supabase.from('sale_items').delete().eq('venta_id', saleId);
      await supabase.from('sales').delete().eq('id', saleId);
      fetchSalesRecord(); fetchCatalog(); 
    } catch (error) {
      alert('Error al eliminar la venta.');
    }
  };

  // --- FILTROS Y CÁLCULOS ---
  const filteredSales = salesRecord.filter(sale => {
    const saleDate = new Date(sale.created_at).getTime();
    const isAfterStart = filterStartDate ? saleDate >= new Date(`${filterStartDate}T00:00:00`).getTime() : true;
    const isBeforeEnd = filterEndDate ? saleDate <= new Date(`${filterEndDate}T23:59:59`).getTime() : true;
    
    const searchStr = salesSearchQuery.toLowerCase();
    const correlativo = sale.correlativo ? sale.correlativo.toString() : sale.id.split('-')[0];
    const userStr = (sale.cash_shifts?.profiles?.nombre || 'Administrador').toLowerCase();
    const isMatch = correlativo.includes(searchStr) || userStr.includes(searchStr);

    return isAfterStart && isBeforeEnd && isMatch;
  });

  const totalOrders = filteredSales.length;
  const totalFacturadoUsd = filteredSales.reduce((acc, sale) => acc + sale.total_usd, 0);

  const methodTotals = {};
  filteredSales.forEach(sale => {
    sale.payments?.forEach(p => {
      const methodName = p.payment_methods?.nombre || 'Desconocido';
      const usdValue = p.moneda_pago === 'VES' ? (p.monto_pagado / sale.tasa_cambio_aplicada) : p.monto_pagado;
      if (!methodTotals[methodName]) methodTotals[methodName] = 0;
      methodTotals[methodName] += usdValue;
    });
  });

  const colorClasses = ['bg-gray-800', 'bg-gray-600', 'bg-black', 'bg-gray-700', 'bg-gray-900', 'bg-gray-500'];

  const handleSaveSettings = async (e) => { e.preventDefault(); setIsSaving(true); await supabase.from('settings').update({ tasa_bcv: parseFloat(settings.tasa_bcv), tasa_personalizada: parseFloat(settings.tasa_personalizada), usar_tasa_personalizada: settings.usar_tasa_personalizada, updated_at: new Date().toISOString() }).eq('id', 1); setIsSaving(false); alert('Guardado'); };
  const handleAddCategory = async (e) => { e.preventDefault(); if (!newCategoryName.trim()) return; setIsSaving(true); await supabase.from('categories').insert([{ nombre: newCategoryName.trim() }]); setNewCategoryName(''); fetchCatalog(); setIsSaving(false); };
  const handleSaveProduct = async (e) => { e.preventDefault(); if (!productForm.nombre || !productForm.categoria_id || !productForm.precio_usd) return; setIsSaving(true); if (editingProductId) { await supabase.from('products').update({ nombre: productForm.nombre.trim(), categoria_id: productForm.categoria_id, precio_usd: parseFloat(productForm.precio_usd) }).eq('id', editingProductId); } else { await supabase.from('products').insert([{ nombre: productForm.nombre.trim(), categoria_id: productForm.categoria_id, precio_usd: parseFloat(productForm.precio_usd), stock_actual: 0 }]); } resetProductForm(); fetchCatalog(); setIsSaving(false); };
  const startEditProduct = (product) => { setEditingProductId(product.id); setProductForm({ nombre: product.nombre, categoria_id: product.categoria_id, precio_usd: product.precio_usd.toString() }); };
  const resetProductForm = () => { setEditingProductId(null); setProductForm({ nombre: '', categoria_id: '', precio_usd: '' }); };
  const handleSavePayment = async (e) => { e.preventDefault(); if (!paymentForm.nombre) return; setIsSaving(true); if (editingPaymentId) { await supabase.from('payment_methods').update({ nombre: paymentForm.nombre.trim(), moneda: paymentForm.moneda, requiere_referencia: paymentForm.requiere_referencia, activo: paymentForm.activo }).eq('id', editingPaymentId); } else { await supabase.from('payment_methods').insert([{ nombre: paymentForm.nombre.trim(), moneda: paymentForm.moneda, requiere_referencia: paymentForm.requiere_referencia, activo: paymentForm.activo }]); } resetPaymentForm(); fetchPaymentMethods(); setIsSaving(false); };
  const startEditPayment = (p) => { setEditingPaymentId(p.id); setPaymentForm({ nombre: p.nombre, moneda: p.moneda, requiere_referencia: p.requiere_referencia, activo: p.activo }); };
  const resetPaymentForm = () => { setEditingPaymentId(null); setPaymentForm({ nombre: '', moneda: 'VES', requiere_referencia: false, activo: true }); };
  const handleSaveTransaction = async (e) => { e.preventDefault(); if (!transactionForm.producto_id || !transactionForm.cantidad || !transactionForm.descripcion) return; setIsSaving(true); try { const { error } = await supabase.from('inventory_transactions').insert([{ producto_id: transactionForm.producto_id, usuario_id: user.id, tipo: transactionForm.tipo, cantidad: parseInt(transactionForm.cantidad), descripcion: transactionForm.descripcion.trim(), numero_orden: transactionForm.numero_orden.trim() || null }]); if (error) throw error; setTransactionForm({ producto_id: '', tipo: 'ingreso', cantidad: '', descripcion: '', numero_orden: '' }); fetchCatalog(); fetchInventoryHistory(); } catch (error) { alert('Error al registrar.'); } finally { setIsSaving(false); } };

  if (loadingData) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><p className="font-bold text-gray-500">Cargando...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative">
      <SidebarMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      
      <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsMenuOpen(true)} className="p-2 bg-gray-100 rounded-lg text-lg hover:bg-gray-200">☰</button>
          <div><h1 className="text-xl font-black text-gray-900">Administración</h1><p className="text-sm text-gray-500 font-medium">Hola, {profile?.nombre}</p></div>
        </div>
        <button onClick={signOut} className="text-sm font-bold px-5 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">Salir</button>
      </header>

      <div className="bg-white border-b border-gray-200 px-4 lg:px-8 pt-4 pb-0 shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide no-scrollbar -mx-2 px-2 pb-4">
          {['tasas', 'catalogo', 'inventario', 'pagos', 'reportes'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-bold transition-all capitalize ${activeTab === tab ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{tab === 'tasas' ? 'Tasa de Cambio' : tab === 'reportes' ? 'Ventas y Reportes' : tab}</button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto">
          
          {/* TAB: TASAS */}
          {activeTab === 'tasas' && (
             <div className="bg-white p-6 lg:p-8 rounded-2xl border border-gray-200 shadow-sm max-w-3xl mx-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Configuración de Moneda</h2>
                <form onSubmit={handleSaveSettings} className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold mb-2 text-gray-700">Tasa Oficial BCV</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold" value={settings.tasa_bcv} onChange={(e) => setSettings({...settings, tasa_bcv: e.target.value})} />
                        <button type="button" onClick={fetchBcvFromApi} className="px-4 py-3 bg-gray-900 text-white rounded-xl font-bold">API</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2 text-gray-700">Tasa Interna</label>
                      <input type="number" step="0.01" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold" value={settings.tasa_personalizada} onChange={(e) => setSettings({...settings, tasa_personalizada: e.target.value})} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="font-bold text-gray-900">Priorizar Tasa Interna en Caja</p>
                    <input type="checkbox" checked={settings.usar_tasa_personalizada} onChange={(e) => setSettings({...settings, usar_tasa_personalizada: e.target.checked})} className="w-6 h-6 rounded text-gray-900" />
                  </div>
                  <button type="submit" disabled={isSaving} className="w-full px-8 py-4 bg-gray-900 text-white rounded-xl font-black text-lg shadow-md hover:bg-gray-800">Guardar Configuración</button>
                </form>
             </div>
          )}

          {/* TAB: CATALOGO */}
          {activeTab === 'catalogo' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
               <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-900 mb-4">Nueva Categoría</h3>
                   <form onSubmit={handleAddCategory} className="flex gap-2">
                     <input type="text" placeholder="Ej: Paletas" required className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                     <button type="submit" disabled={isSaving} className="px-4 py-2 bg-gray-900 text-white rounded-xl font-bold">+</button>
                   </form>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-900">{editingProductId ? '✏️ Editar Producto' : 'Nuevo Producto'}</h3>{editingProductId && <button onClick={resetProductForm} className="text-xs font-bold text-red-500">Cancelar</button>}</div>
                   <form onSubmit={handleSaveProduct} className="space-y-4">
                     <input type="text" required placeholder="Nombre" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={productForm.nombre} onChange={(e) => setProductForm({...productForm, nombre: e.target.value})} />
                     <div className="grid grid-cols-2 gap-4">
                       <select required className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={productForm.categoria_id} onChange={(e) => setProductForm({...productForm, categoria_id: e.target.value})}>
                         <option value="">Categoría...</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                       </select>
                       <input type="number" step="0.01" required placeholder="Precio $" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={productForm.precio_usd} onChange={(e) => setProductForm({...productForm, precio_usd: e.target.value})} />
                     </div>
                     <button type="submit" disabled={isSaving || categories.length === 0} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Guardar</button>
                   </form>
                 </div>
               </div>
               <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                 <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h3 className="font-bold text-gray-900">Catálogo Base</h3></div>
                 <div className="flex-1 overflow-y-auto p-6 space-y-3">
                   {products.map(product => (
                     <div key={product.id} className="p-4 border border-gray-100 rounded-xl flex justify-between items-center bg-white hover:border-gray-300">
                       <div><p className="text-xs text-gray-400 font-bold uppercase">{product.categories?.nombre}</p><p className="font-bold text-gray-900">{product.nombre}</p></div>
                       <div className="flex items-center gap-3"><span className="font-black text-green-600 bg-green-50 px-3 py-1 rounded-lg">{product.precio_usd.toFixed(2)}$</span><button onClick={() => startEditProduct(product)} className="w-8 h-8 flex justify-center items-center bg-gray-50 text-gray-600 rounded-lg">✎</button></div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
          )}

          {/* TAB: INVENTARIO */}
          {activeTab === 'inventario' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
               <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-900 mb-4">Registrar Movimiento</h3>
                   <form onSubmit={handleSaveTransaction} className="space-y-4">
                     <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                       <button type="button" onClick={() => setTransactionForm({...transactionForm, tipo: 'ingreso'})} className={`py-2 rounded-lg text-sm font-bold transition-all ${transactionForm.tipo === 'ingreso' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>+ Ingreso</button>
                       <button type="button" onClick={() => setTransactionForm({...transactionForm, tipo: 'salida_manual'})} className={`py-2 rounded-lg text-sm font-bold transition-all ${transactionForm.tipo === 'salida_manual' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>- Salida / Merma</button>
                     </div>
                     <select required className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={transactionForm.producto_id} onChange={(e) => setTransactionForm({...transactionForm, producto_id: e.target.value})}>
                       <option value="">Selecciona el producto...</option>
                       {products.map(p => <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock_actual})</option>)}
                     </select>
                     <input type="number" min="1" required placeholder="Cantidad" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold" value={transactionForm.cantidad} onChange={(e) => setTransactionForm({...transactionForm, cantidad: e.target.value})} />
                     <input type="text" required placeholder="Descripción / Motivo" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={transactionForm.descripcion} onChange={(e) => setTransactionForm({...transactionForm, descripcion: e.target.value})} />
                     <button type="submit" disabled={isSaving} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Confirmar Movimiento</button>
                   </form>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-900 mb-3 border-b pb-2">Existencias Actuales</h3>
                   <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                     {products.map(p => (
                       <div key={p.id} className="flex justify-between items-center text-sm"><span className="text-gray-700 truncate pr-2">{p.nombre}</span><span className="font-bold bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs">{p.stock_actual}</span></div>
                     ))}
                   </div>
                 </div>
               </div>
               <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                 <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h3 className="font-bold text-gray-900">Historial de Inventario</h3></div>
                 <div className="flex-1 overflow-y-auto p-6">
                   {inventoryHistory.length === 0 ? <p className="text-center text-gray-400 mt-10">No hay movimientos.</p> : (
                     <div className="space-y-3">
                       {inventoryHistory.map(mov => {
                         const isIngreso = mov.tipo === 'ingreso';
                         return (
                           <div key={mov.id} className="p-4 border border-gray-100 rounded-xl flex justify-between items-center bg-white shadow-sm gap-2">
                             <div>
                               <div className="flex items-center gap-2 mb-1"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${isIngreso ? 'bg-gray-200 text-gray-800' : 'bg-red-100 text-red-800'}`}>{mov.tipo}</span><span className="text-xs text-gray-400 font-medium">{new Date(mov.created_at).toLocaleString('es-VE')}</span></div>
                               <p className="font-bold text-gray-900 text-base">{mov.products?.nombre}</p>
                               <p className="text-sm text-gray-500 mt-1">📝 {mov.descripcion}</p>
                             </div>
                             <div className="flex items-center justify-end"><span className={`font-black text-xl ${isIngreso ? 'text-gray-900' : 'text-red-600'}`}>{isIngreso ? '+' : '-'}{mov.cantidad}</span></div>
                           </div>
                         )
                       })}
                     </div>
                   )}
                 </div>
               </div>
             </div>
          )}

          {/* TAB: PAGOS */}
          {activeTab === 'pagos' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
               <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-900 mb-4">{editingPaymentId ? '✏️ Editar Método' : 'Nuevo Método'}</h3>
                   <form onSubmit={handleSavePayment} className="space-y-4">
                     <input type="text" required placeholder="Nombre (Ej: Zelle)" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={paymentForm.nombre} onChange={(e) => setPaymentForm({...paymentForm, nombre: e.target.value})} />
                     <select className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" value={paymentForm.moneda} onChange={(e) => setPaymentForm({...paymentForm, moneda: e.target.value})}><option value="VES">Bolívares</option> <option value="USD">Dólares</option></select>
                     <button type="submit" className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Guardar</button>
                   </form>
                 </div>
               </div>
               <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm h-[600px] overflow-y-auto p-6">
                 {paymentMethods.map(p => (
                   <div key={p.id} className="p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm mb-3">
                     <p className="font-bold">{p.nombre} ({p.moneda})</p>
                     <button onClick={() => startEditPayment(p)} className="bg-gray-100 p-2 rounded-lg">✎</button>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* TAB: REPORTES DE VENTAS */}
          {activeTab === 'reportes' && (
            <div className="space-y-6">
              
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus-within:ring-2 ring-gray-900">
                      <span className="text-gray-400 text-xs mr-1 font-bold">DESDE:</span>
                      <input type="date" className="text-sm outline-none text-gray-700 bg-transparent cursor-pointer" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
                    </div>
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus-within:ring-2 ring-gray-900">
                      <span className="text-gray-400 text-xs mr-1 font-bold">HASTA:</span>
                      <input type="date" className="text-sm outline-none text-gray-700 bg-transparent cursor-pointer" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
                    </div>
                    {(filterStartDate || filterEndDate) && (
                      <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-xs text-red-500 font-bold px-2 hover:underline">Limpiar Fechas</button>
                    )}
                  </div>
                  <div className="flex-1 md:w-64 flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus-within:ring-2 ring-gray-900">
                    <span className="text-gray-400 mr-2">🔍</span>
                    <input type="text" placeholder="Buscar ticket o cajero..." className="text-sm outline-none w-full bg-transparent text-gray-800" value={salesSearchQuery} onChange={(e) => setSalesSearchQuery(e.target.value)} />
                  </div>
                </div>
                <button onClick={fetchSalesRecord} className="w-full md:w-auto px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-sm">
                  ↻ Actualizar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl flex items-stretch overflow-hidden shadow-sm h-24">
                  <div className="bg-gray-900 w-24 flex justify-center items-center text-white text-3xl shrink-0">🛒</div>
                  <div className="p-5 flex flex-col justify-center">
                    <p className="text-gray-500 text-sm font-semibold mb-1">Cantidad de pedidos</p>
                    <p className="text-3xl font-black text-gray-900 leading-none">{totalOrders}</p>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl flex items-stretch overflow-hidden shadow-sm h-24">
                  <div className="bg-black w-24 flex justify-center items-center text-white text-3xl shrink-0">🧾</div>
                  <div className="p-5 flex flex-col justify-center">
                    <p className="text-gray-500 text-sm font-semibold mb-1">Total Facturado</p>
                    <p className="text-3xl font-black text-gray-900 leading-none">${totalFacturadoUsd.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Object.entries(methodTotals).map(([method, amount], idx) => {
                  const color = colorClasses[idx % colorClasses.length];
                  return (
                    <div key={method} className="bg-white border border-gray-200 rounded-xl flex items-stretch overflow-hidden h-20 shadow-sm">
                      <div className={`${color} w-3 shrink-0`}></div>
                      <div className="p-3 flex flex-col justify-center overflow-hidden">
                        <p className="text-gray-500 text-xs font-semibold truncate w-full" title={method}>{method}</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">${amount.toFixed(2)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs text-gray-800 font-black tracking-wide bg-gray-50">
                        <th className="p-4">Pedido</th>
                        <th className="p-4">Fecha de registro</th>
                        <th className="p-4">Método de pago</th>
                        <th className="p-4">Referencia</th>
                        <th className="p-4">Precio USD</th>
                        <th className="p-4">Cajero / Usuario</th>
                        <th className="p-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.length === 0 ? (
                        <tr><td colSpan="7" className="text-center py-12 text-gray-400 font-medium">No se encontraron registros.</td></tr>
                      ) : (
                        filteredSales.map((sale) => (
                          <tr key={sale.id} className="border-b border-gray-100 hover:bg-gray-50 text-sm text-gray-600 transition-colors">
                            <td className="p-4 font-bold text-gray-900">#{sale.correlativo || sale.id.split('-')[0]}</td>
                            <td className="p-4">
                              <span className="font-semibold text-gray-800">{new Date(sale.created_at).toLocaleDateString('es-VE')}</span> <br/>
                              <span className="text-xs text-gray-400 font-medium">{new Date(sale.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td className="p-4">
                              {sale.payments?.map((p, i) => (
                                <div key={i} className="flex items-center gap-1.5 font-medium text-xs mb-1 bg-gray-100 px-2 py-1 rounded inline-block w-full">
                                  {p.payment_methods?.nombre}
                                </div>
                              ))}
                            </td>
                            <td className="p-4 font-medium">{sale.payments?.map(p => p.referencia).filter(Boolean).join(', ') || '-'}</td>
                            <td className="p-4 font-black text-gray-900">${sale.total_usd.toFixed(2)}</td>
                            <td className="p-4 font-medium">{sale.cash_shifts?.profiles?.nombre || 'Administrador'}</td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-3 text-gray-500">
                                <button onClick={() => handleOpenSaleDetails(sale)} className="hover:text-gray-900 transition-colors bg-white border border-gray-200 px-3 py-1.5 rounded shadow-sm font-bold text-xs">Ver Detalle</button>
                                <button onClick={() => handleDeleteSale(sale.id)} className="hover:text-red-600 transition-colors bg-white border border-gray-200 px-3 py-1.5 rounded shadow-sm font-bold text-xs">Eliminar</button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL: DETALLE DE LA VENTA */}
{/* MODAL: DETALLE DE LA VENTA (DISEÑO ACTUALIZADO) */}
      {selectedSaleDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#f3f4f6] rounded-[24px] w-full max-w-lg max-h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {isLoadingDetails ? (
                <p className="text-center py-10 text-gray-500 font-bold">Cargando detalles...</p>
              ) : (
                <>
                  {/* Cabecera idéntica a la imagen */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h2 className="text-xl font-black text-gray-900 tracking-tight">
                        Orden #{selectedSaleDetails.correlativo || selectedSaleDetails.id.split('-')[0]} <span className="text-sm font-medium text-gray-800">(Principal)</span>
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Realizado por {selectedSaleDetails.cash_shifts?.profiles?.nombre || 'Administrador'} .
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">
                        {new Date(selectedSaleDetails.created_at).toLocaleString('es-VE', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Tarjeta: Cliente */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-bold text-gray-900 text-lg mb-3">Cliente</h3>
                    <p className="text-center text-gray-700 text-base py-2">No se registró información del cliente.</p>
                  </div>

                  {/* Tarjeta: Venta */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">Venta</h3>
                    
                    {/* Lista de Productos */}
                    <div className="space-y-3 mb-6">
                      {selectedSaleDetails.items?.map((item, index) => (
                        <div key={index} className="flex justify-between items-start text-sm">
                          <div className="flex items-center gap-2 text-gray-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1"></div>
                            <span className="font-semibold">{item.products?.nombre}</span>
                          </div>
                          <div className="flex gap-4 text-gray-800 font-semibold min-w-[100px] justify-end">
                            <span>{item.cantidad} Und.</span>
                            {/* Si tu tabla sale_items guarda el precio, se mostrará aquí */}
                            {item.precio_unitario && <span>${(item.precio_unitario * item.cantidad).toFixed(2)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totales */}
                    <div className="border-t border-gray-100 pt-4 space-y-2 text-sm font-semibold text-gray-600">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>${selectedSaleDetails.total_usd?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="flex justify-between text-gray-900 font-bold">
                        <span>Total USD:</span>
                        <span>${selectedSaleDetails.total_usd?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="flex justify-between text-gray-900 font-bold">
                        <span>Total BS:</span>
                        {/* Se calcula dinámicamente para evitar el error de pantalla en blanco */}
                        <span>BS {((selectedSaleDetails.total_usd || 0) * (selectedSaleDetails.tasa_cambio_aplicada || 1)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tasa de Cambio:</span>
                        <span>{(selectedSaleDetails.tasa_cambio_aplicada || 0).toFixed(2)} Bs./$</span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta: Métodos de pago y vuelto */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-4">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">Métodos de pago y vuelto</h3>
                    <div className="space-y-3 text-sm font-bold text-gray-600">
                      {selectedSaleDetails.payments?.map((p, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                          <span className="capitalize">{p.payment_methods?.nombre}</span>
                          <span>{p.moneda_pago === 'USD' ? '$' : 'BS'} {p.monto_pagado.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Botón inferior alineado a la derecha */}
            <div className="p-5 bg-white border-t border-gray-100 flex justify-end shrink-0">
              <button 
                onClick={() => setSelectedSaleDetails(null)} 
                className="px-8 py-3 bg-[#5024FF] text-white rounded-xl font-bold text-base hover:bg-[#401bcc] transition-colors w-full md:w-auto shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}