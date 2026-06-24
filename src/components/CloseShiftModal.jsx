import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function CloseShiftModal({ isOpen, onClose, activeShift, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [salesTotalUsd, setSalesTotalUsd] = useState(0);
  const [paymentsSummary, setPaymentsSummary] = useState([]);

  useEffect(() => {
    if (isOpen && activeShift) {
      calculateShiftTotals();
    }
  }, [isOpen, activeShift]);

  const calculateShiftTotals = async () => {
    setLoading(true);
    try {
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('id, total_usd')
        .eq('turno_id', activeShift.id);

      if (salesError) throw salesError;

      const totalUsd = sales.reduce((acc, sale) => acc + sale.total_usd, 0);
      setSalesTotalUsd(totalUsd);

      if (sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('monto_pagado, moneda_pago, payment_methods(nombre)')
          .in('venta_id', saleIds);

        if (paymentsError) throw paymentsError;

        const summary = {};
        payments.forEach(p => {
          const method = p.payment_methods?.nombre || 'Desconocido';
          const currency = p.moneda_pago;
          const key = `${method}-${currency}`;
          if (!summary[key]) { summary[key] = { nombre: method, moneda: currency, total: 0 }; }
          summary[key].total += p.monto_pagado;
        });

        setPaymentsSummary(Object.values(summary));
      } else {
        setPaymentsSummary([]);
      }
    } catch (error) {
      console.error('Error calculando totales:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!window.confirm('¿Estás seguro de cerrar la caja? Ya no podrás registrar más ventas en este turno.')) return;
    setIsClosing(true);
    try {
      const { error } = await supabase.from('cash_shifts').update({ estado: 'cerrada', hora_cierre: new Date().toISOString() }).eq('id', activeShift.id);
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (error) {
      alert('Hubo un error al intentar cerrar la caja.');
    } finally {
      setIsClosing(false);
    }
  };

  if (!isOpen || !activeShift) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 bg-red-600 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black">Cierre de Caja (Turno Z)</h2>
            <p className="text-red-100 text-sm mt-1">Resumen de operaciones del turno actual</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-black/20 hover:bg-black/30 rounded-full flex items-center justify-center font-bold transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-gray-50">
          {loading ? (
            <p className="text-center text-gray-500 py-10 font-bold">Calculando totales...</p>
          ) : (
            <>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-2 mb-3">1. Fondos Iniciales (Apertura)</h3>
                <div className="space-y-2 text-sm font-medium">
                  <div className="flex justify-between"><span className="text-gray-600">Efectivo USD:</span><span className="text-gray-900">{activeShift.base_usd_efectivo?.toFixed(2) || '0.00'} $</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Efectivo Bs:</span><span className="text-gray-900">{activeShift.base_bs_efectivo?.toFixed(2) || '0.00'} Bs</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Pago Móvil Bs:</span><span className="text-gray-900">{activeShift.base_pm?.toFixed(2) || '0.00'} Bs</span></div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-gray-100 pb-2 mb-3">
                  <h3 className="font-bold text-gray-800">2. Ingresos por Ventas</h3>
                  <span className="text-xs font-black bg-green-100 text-green-800 px-2 py-1 rounded">Total: {salesTotalUsd.toFixed(2)} $</span>
                </div>
                {paymentsSummary.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No se registraron ventas en este turno.</p>
                ) : (
                  <div className="space-y-2 text-sm font-medium">
                    {paymentsSummary.map((summary, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                        <span className="text-gray-700">{summary.nombre}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-500">{summary.moneda}</span>
                          <span className="text-gray-900 font-bold">{summary.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-white flex gap-4 shrink-0">
          <button onClick={onClose} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancelar</button>
          <button onClick={handleCloseShift} disabled={loading || isClosing} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors shadow-md disabled:shadow-none">
            {isClosing ? 'Cerrando...' : 'Confirmar Cierre Z'}
          </button>
        </div>
      </div>
    </div>
  );
}