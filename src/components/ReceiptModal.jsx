import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ReceiptModal({ isOpen, onClose, saleId }) {
  const [loading, setLoading] = useState(true);
  const [saleData, setSaleData] = useState(null);

  useEffect(() => {
    if (isOpen && saleId) {
      fetchReceiptData();
    }
  }, [isOpen, saleId]);

  const fetchReceiptData = async () => {
    setLoading(true);
    try {
      const { data: sale, error: saleError } = await supabase.from('sales').select('*').eq('id', saleId).single();
      if (saleError) throw saleError;

      const { data: items, error: itemsError } = await supabase.from('sale_items').select('cantidad, precio_unitario_usd, products(nombre)').eq('venta_id', saleId);
      if (itemsError) throw itemsError;

      const { data: payments, error: paymentsError } = await supabase.from('payments').select('monto_pagado, moneda_pago, referencia, monto_vuelto_entregado, payment_methods(nombre)').eq('venta_id', saleId);
      if (paymentsError) throw paymentsError;

      setSaleData({ ...sale, items, payments });
    } catch (error) {
      console.error('Error cargando recibo:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        <div className="flex-1 overflow-y-auto p-6 bg-white font-mono text-sm text-gray-800">
          {loading || !saleData ? (
            <p className="text-center py-10 font-bold text-gray-500">Generando ticket...</p>
          ) : (
            <>
              <div className="text-center mb-6 border-b-2 border-dashed border-gray-300 pb-4">
                <h2 className="text-2xl font-black uppercase tracking-widest mb-1 text-gray-900">Santa Paletta</h2>
                <p className="text-xs text-gray-500 font-sans">Mérida, Venezuela</p>
                <div className="mt-4 flex justify-between text-xs font-sans font-medium">
                  <span>{new Date(saleData.created_at).toLocaleDateString('es-VE')}</span>
                  <span>{new Date(saleData.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs font-sans font-medium">
                  <span>Tasa BCV:</span>
                  <span>{saleData.tasa_cambio_aplicada.toFixed(2)} Bs</span>
                </div>
                <p className="text-sm text-left mt-3 font-sans">Ticket N°: <span className="font-bold text-gray-900">{saleData.correlativo || saleData.id.split('-')[0]}</span></p>
              </div>

              <div className="mb-4">
                <div className="flex justify-between font-bold border-b border-gray-800 pb-1 mb-2 text-xs font-sans">
                  <span className="w-8">CANT</span>
                  <span className="flex-1 text-left">DESCRIPCIÓN</span>
                  <span className="w-16 text-right">TOTAL</span>
                </div>
                {saleData.items.map((item, index) => (
                  <div key={index} className="flex justify-between mb-1">
                    <span className="w-8 text-center">{item.cantidad}</span>
                    <span className="flex-1 text-left truncate pr-2">{item.products?.nombre}</span>
                    <span className="w-16 text-right font-semibold">{(item.cantidad * item.precio_unitario_usd).toFixed(2)}$</span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-dashed border-gray-300 pt-3 mb-4 space-y-1 font-sans">
                <div className="flex justify-between items-center text-lg font-black text-gray-900">
                  <span>TOTAL USD:</span>
                  <span>{saleData.total_usd.toFixed(2)} $</span>
                </div>
                <div className="flex justify-between items-center text-gray-600 font-bold">
                  <span>TOTAL Bs:</span>
                  <span>{saleData.total_bs.toFixed(2)} Bs</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3 mb-6 font-sans">
                <p className="font-bold mb-2 text-xs text-gray-500">PAGOS RECIBIDOS:</p>
                {saleData.payments.map((p, index) => (
                  <div key={index} className="flex justify-between text-xs mb-1 font-medium">
                    <span className="uppercase">{p.payment_methods?.nombre} {p.referencia ? `(Ref: ${p.referencia})` : ''}</span>
                    <span className="font-bold text-gray-900">{p.monto_pagado.toFixed(2)} {p.moneda_pago === 'USD' ? '$' : 'Bs'}</span>
                  </div>
                ))}
                {saleData.payments[0]?.monto_vuelto_entregado > 0 && (
                  <div className="flex justify-between font-black text-xs mt-2 pt-2 border-t border-gray-200 text-gray-900">
                    <span>VUELTO / CAMBIO:</span>
                    <span>{saleData.payments[0].monto_vuelto_entregado.toFixed(2)} $</span>
                  </div>
                )}
              </div>
              <div className="text-center text-xs text-gray-400 font-black mt-8 font-sans">¡GRACIAS POR TU COMPRA!</div>
            </>
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0">
          <button onClick={onClose} className="w-full py-4 bg-gray-900 text-white rounded-xl font-black text-lg hover:bg-gray-800 transition-colors shadow-md">
            Siguiente Cliente
          </button>
        </div>
      </div>
    </div>
  );
}