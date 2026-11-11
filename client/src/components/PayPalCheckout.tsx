import { useEffect, useRef, useState } from 'react';
import { api, money } from '../api';
import { useApp } from '../App';
import { ErrorNote, Modal, SimTag, Spinner } from './ui';

let loadedIntent: string | null = null;
function loadSdk(clientId: string, intent: 'authorize' | 'capture'): Promise<any> {
  if ((window as any).paypal && loadedIntent === intent) return Promise.resolve((window as any).paypal);
  document.querySelectorAll('script[data-paypal-sdk]').forEach((s) => s.remove());
  delete (window as any).paypal;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=${intent}&components=buttons`;
    s.dataset.paypalSdk = '1';
    s.onload = () => { loadedIntent = intent; res((window as any).paypal); };
    s.onerror = () => rej(new Error('Could not load the PayPal JS SDK'));
    document.head.appendChild(s);
  });
}

/** Funding button: SIMULATED approval when PayPal isn't configured, PayPal Buttons (sandbox) otherwise. */
export default function PayPalCheckout({ projectId, target, amount, label, intent, onDone, disabled }: { projectId: string; target: string; amount: number; label: string; intent: 'AUTHORIZE' | 'CAPTURE'; onDone: () => void; disabled?: boolean }) {
  const { config } = useApp();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const simulated = config?.paypal.mode === 'SIMULATED';

  useEffect(() => {
    if (!open || simulated || !config?.paypal.clientId) return;
    let cancelled = false;
    loadSdk(config.paypal.clientId, intent === 'AUTHORIZE' ? 'authorize' : 'capture').then((paypal) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      paypal.Buttons({
        createOrder: async () => (await api.post(`/projects/${projectId}/fund`, { target })).orderId,
        onApprove: async (data: any) => {
          setBusy(true);
          try { const r = await api.post(`/projects/${projectId}/fund/confirm`, { target, orderId: data.orderID }); setDone(`PayPal confirmed: ${r.status}`); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        },
        onError: (e: any) => setErr(String(e?.message || e)),
        onCancel: () => setErr('Payment cancelled — funding status unchanged.'),
      }).render(ref.current);
    }).catch((e) => setErr(e.message));
    return () => { cancelled = true; };
  }, [open]);

  const start = async () => {
    setErr(null); setDone(null); setOpen(true);
    if (simulated) { try { setOrder(await api.post(`/projects/${projectId}/fund`, { target })); } catch (e: any) { setErr(e.message); } }
  };
  const confirmSim = async () => {
    setBusy(true);
    try { const r = await api.post(`/projects/${projectId}/fund/confirm`, { target, orderId: order.orderId }); setDone(`Simulated ${r.status}`); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn-primary" disabled={disabled} onClick={start}>{label}</button>
      <Modal open={open} onClose={() => { setOpen(false); setOrder(null); }} title={`${intent === 'AUTHORIZE' ? 'Authorize' : 'Pay'} ${money(amount)}`}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">{intent === 'AUTHORIZE'
            ? 'PayPal places an authorization (hold) on your account for this milestone. It is captured only after the agreed assessment and your approval. Authorizations are valid up to 29 days (3-day honor period) — this is not escrow.'
            : 'This payment is captured immediately per the approved agreement.'}</p>
          {simulated ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2"><SimTag /> <span className="text-amber-900">PayPal credentials are not configured. This approval is simulated — no money moves.</span></div>
              {order ? <div className="text-xs text-amber-900">Simulated order: <code>{order.orderId}</code></div> : !err && <Spinner label="Creating simulated order…" />}
              {!done && <button className="btn-primary" disabled={!order || busy} onClick={confirmSim}>{busy ? 'Confirming…' : 'Approve simulated payment'}</button>}
            </div>
          ) : (
            <div><div className="mb-2 text-xs text-slate-500">PayPal {config?.paypal.mode === 'PAYPAL_SANDBOX' ? 'Sandbox' : 'Live'} — funding status updates only after the server verifies PayPal's response.</div><div ref={ref} />{busy && <Spinner label="Verifying with PayPal…" />}</div>
          )}
          {done && <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">{done}. Funding status updated.</div>}
          <ErrorNote error={err} />
        </div>
      </Modal>
    </>
  );
}
