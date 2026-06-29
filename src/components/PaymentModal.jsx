import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';

export default function PaymentModal({ isOpen, onClose, activeShiftId, onSuccess }) {
  const { items, tasaCambio, getTotalUsd, clearCart } = useCartStore();
  
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [paymentRows, setPaymentRows] = useState([
    { id: Date.now(), methodId: '', amount: '', reference: '' }
  ]);

  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
      setPaymentRows([{ id: Date.now(), methodId: '', amount: '', reference: '' }]);
      setSelectedClientId('');
    }
  }, [isOpen]);

  const fetchInitialData = async () => {
    setLoading(true);
    const [methodsRes, clientsRes] = await Promise.all([
      supabase.from('payment_methods').select('*').eq('activo', true).order('nombre', { ascending: true }),
      supabase.from('clients').select('*').order('nombre', { ascending: true })
    ]);
    
    if (methodsRes.data) setPaymentMethods(methodsRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    setLoading(false);
  };

  const totalUsd = getTotalUsd();
  const totalBs = totalUsd * tasaCambio;

  const totalPaidUsd = paymentRows.reduce((sum, row) => {
    const method = paymentMethods.find(m => m.id === row.methodId);
    if (!method) return sum;
    const value = parseFloat(row.amount) || 0;
    return method.moneda === 'VES' ? sum + (value / tasaCambio) : sum + value;
  }, 0);

  const remainingUsd = Math.max(0, totalUsd - totalPaidUsd);
  const remainingBs = remainingUsd * tasaCambio;
  
  const changeUsd = Math.max(0, totalPaidUsd - totalUsd);
  const changeBs = changeUsd * tasaCambio;

  const addRow = () => {
    if (remainingUsd <= 0.01) return;
    setPaymentRows([...paymentRows, { id: Date.now(), methodId: '', amount: '', reference: '' }]);
  };

  const removeRow = (id) => {
    setPaymentRows(paymentRows.filter(row => row.id !== id));
  };

  const updateRow = (id, field, value) => {
    setPaymentRows(paymentRows.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        if (field === 'methodId' && !row.amount && value) {
          const method = paymentMethods.find(m => m.id === value);
          if (method) {
            const otherRowsPaidUsd = paymentRows.filter(r => r.id !== id).reduce((sum, r) => {
              const m = paymentMethods.find(x => x.id === r.methodId);
              if (!m) return sum;
              const val = parseFloat(r.amount) || 0;
              return m.moneda === 'VES' ? sum + (val / tasaCambio) : sum + val;
            }, 0);
            
            const realRemainingUsd = Math.max(0, totalUsd - otherRowsPaidUsd);
            const amountToFill = method.moneda === 'VES' ? realRemainingUsd * tasaCambio : realRemainingUsd;
            if (amountToFill > 0) {
              updatedRow.amount = amountToFill.toFixed(2);
            }
          }
        }
        return updatedRow;
      }
      return row;
    }));
  };

  const handleProcessPayment = async () => {
    const validRows = paymentRows.filter(r => r.methodId && parseFloat(r.amount) > 0);
    if (validRows.length === 0) return alert('Debes registrar al menos un método de pago válido.');
    if (remainingUsd > 0.01) return alert('El pago está incompleto.');

    // Validar si hay pago a crédito
    const hasCredit = validRows.some(row => {
      const method = paymentMethods.find(m => m.id === row.methodId);
      return method && method.nombre.toLowerCase() === 'crédito';
    });

    if (hasCredit && !selectedClientId) {
      return alert('Debes seleccionar un Cliente para poder procesar pagos a Crédito.');
    }

    setIsProcessing(true);

    try {
      // 1. Insertar la venta
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          turno_id: activeShiftId,
          total_usd: totalUsd,
          tasa_cambio_aplicada: tasaCambio,
          total_bs: totalBs,
          cliente_id: selectedClientId || null // Asociamos la venta al cliente si existe
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Insertar los items
      const saleItemsData = items.map(item => ({
        venta_id: sale.id,
        producto_id: item.id,
        cantidad: item.cantidad,
        precio_unitario_usd: item.precio_usd
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);
      if (itemsError) throw itemsError;

      // 3. Insertar los pagos
      const paymentsData = validRows.map(row => {
        const method = paymentMethods.find(m => m.id === row.methodId);
        return {
          venta_id: sale.id,
          metodo_pago_id: method.id,
          monto_pagado: parseFloat(row.amount),
          moneda_pago: method.moneda,
          referencia: row.reference || null,
          monto_vuelto_entregado: changeUsd > 0 ? changeUsd : 0
        };
      });

      const { error: payError } = await supabase.from('payments').insert(paymentsData);
      if (payError) throw payError;

      // 4. Si hay crédito, sumar a la deuda del cliente
      if (hasCredit) {
        const creditAmount = validRows
          .filter(r => {
            const m = paymentMethods.find(x => x.id === r.methodId);
            return m && m.nombre.toLowerCase() === 'crédito';
          })
          .reduce((sum, r) => sum + parseFloat(r.amount), 0);

        const currentClient = clients.find(c => c.id === selectedClientId);
        if (currentClient && creditAmount > 0) {
          const newDebt = (currentClient.deuda_usd || 0) + creditAmount;
          await supabase.from('clients').update({ deuda_usd: newDebt }).eq('id', selectedClientId);
        }
      }

      clearCart();
      onSuccess(sale.id);
      onClose();

    } catch (error) {
      console.error('Error procesando pago:', error);
      alert('Error al registrar la venta.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 bg-gray-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black">Procesar Cobro</h2>
            <p className="text-gray-400 text-sm mt-1">Tasa activa: {tasaCambio.toFixed(2)} Bs</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center font-bold transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-8">
          <div className="flex-1 flex flex-col">
            
            {/* SELECTOR DE CLIENTE (OPCIONAL) */}
            <div className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
              <label className="block text-sm font-bold text-blue-900 mb-2">Asignar Cliente (Opcional o para Crédito)</label>
              <select 
                className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Consumidor Final (Sin Cliente)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-between items-end border-b border-gray-100 pb-2 mb-4">
              <h3 className="font-bold text-gray-800">Métodos de Pago</h3>
            </div>
            {loading ? <p className="text-gray-500 text-center py-10">Cargando métodos...</p> : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                {paymentRows.map((row) => {
                  const selectedMethod = paymentMethods.find(m => m.id === row.methodId);
                  const isCreditMethod = selectedMethod?.nombre.toLowerCase() === 'crédito';
                  
                  return (
                    <div key={row.id} className={`flex flex-wrap sm:flex-nowrap gap-3 p-3 rounded-xl border focus-within:ring-2 focus-within:border-transparent transition-all ${isCreditMethod ? 'bg-orange-50 border-orange-200 focus-within:ring-orange-500' : 'bg-gray-50 border-gray-200 focus-within:ring-gray-900'}`}>
                      <div className="w-full sm:w-1/3">
                        <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none text-sm font-medium" value={row.methodId} onChange={(e) => updateRow(row.id, 'methodId', e.target.value)}>
                          <option value="">Seleccione...</option>
                          {paymentMethods.map(m => (
                            <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-full sm:flex-1 relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">
                          {selectedMethod ? (selectedMethod.moneda === 'USD' ? '$' : 'Bs') : '#'}
                        </span>
                        <input type="number" step="0.01" min="0" placeholder="0.00" disabled={!row.methodId} className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none text-sm disabled:bg-gray-100 font-semibold" value={row.amount} onChange={(e) => updateRow(row.id, 'amount', e.target.value)} />
                      </div>
                      {selectedMethod?.requiere_referencia ? (
                        <div className="w-full sm:w-1/4">
                          <input type="text" placeholder="Ref." maxLength="8" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none text-sm uppercase" value={row.reference} onChange={(e) => updateRow(row.id, 'reference', e.target.value)} />
                        </div>
                      ) : (
                        <div className="hidden sm:block sm:w-1/4"></div>
                      )}
                      <button onClick={() => removeRow(row.id)} disabled={paymentRows.length === 1} className="w-full sm:w-10 h-10 flex items-center justify-center bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">🗑</button>
                    </div>
                  )
                })}
                <button onClick={addRow} disabled={remainingUsd <= 0.01} className="w-full py-3 mt-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl font-bold hover:border-gray-900 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  + Dividir en otro método
                </button>
              </div>
            )}
          </div>

          <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4">
            <div className="bg-gray-100 p-5 rounded-2xl border border-gray-200">
              <p className="text-xs text-gray-500 font-bold uppercase mb-1">Total a Pagar</p>
              <p className="text-3xl font-black text-gray-900 leading-none">{totalUsd.toFixed(2)}$</p>
              <p className="text-sm font-semibold text-gray-500 mt-1">{totalBs.toFixed(2)} Bs</p>
            </div>
            <div className="flex-1 border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 bg-white flex justify-between items-center border-b border-gray-100">
                <span className="text-sm font-bold text-gray-500">Abonado (Eq. USD)</span>
                <span className="font-bold text-gray-900">{totalPaidUsd.toFixed(2)}$</span>
              </div>
              {remainingUsd > 0.01 ? (
                <div className="p-5 bg-red-50 flex-1 flex flex-col justify-center">
                  <span className="text-xs font-bold text-red-500 uppercase block mb-1">Resta por Pagar</span>
                  <p className="text-2xl font-black text-red-600">{remainingUsd.toFixed(2)}$</p>
                  <p className="text-sm font-bold text-red-500 mt-1">{remainingBs.toFixed(2)} Bs</p>
                </div>
              ) : (
                <div className="p-5 bg-green-50 flex-1 flex flex-col justify-center">
                  <span className="text-xs font-bold text-green-700 uppercase block mb-1">Vuelto / Cambio a entregar</span>
                  <p className="text-2xl font-black text-green-800">{changeUsd.toFixed(2)}$</p>
                  <p className="text-sm font-bold text-green-600 mt-1">{changeBs.toFixed(2)} Bs</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-4 shrink-0">
          <button onClick={onClose} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-colors">Cancelar</button>
          <button onClick={handleProcessPayment} disabled={isProcessing || remainingUsd > 0.01} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-lg hover:bg-green-700 disabled:bg-gray-300 transition-colors shadow-md disabled:shadow-none">
            {isProcessing ? 'Registrando...' : 'Confirmar Venta'}
          </button>
        </div>
      </div>
    </div>
  );
}