"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, session } from "@/lib/api";
export default function Credits() {
  const [packs, setPacks] = useState<any[]>([]),
    [purchases, setPurchases] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [qr, setQr] = useState(""),
    [txn, setTxn] = useState(""),
    [msg, setMsg] = useState(""),
    [balance] = useState(session()?.user.credits ?? 0);
  async function load() {
    const [p, history] = await Promise.all([
      api("/credits/packages"),
      api("/credits/purchases"),
    ]);
    setPacks(p as any[]);
    setPurchases(history as any[]);
  }
  useEffect(() => {
    load();
  }, []);
  async function choose(pack: any) {
    setSelected(pack);
    const upi = process.env.NEXT_PUBLIC_UPI_ID ?? "vaaniframe@upi",
      name = process.env.NEXT_PUBLIC_PAYEE_NAME ?? "Drishyana AI",
      url = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${(pack.priceInPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(pack.name)}`;
    setQr(
      await QRCode.toDataURL(url, {
        width: 260,
        margin: 1,
        color: { dark: "#21162f", light: "#ffffff" },
      }),
    );
  }
  async function submit() {
    if (!txn.trim()) {
      setMsg("Enter your UPI/bank transaction ID.");
      return;
    }
    await api(`/credits/purchase-request/${selected.id}`, {
      method: "POST",
      body: JSON.stringify({ transactionId: txn }),
    });
    setMsg("Payment submitted. Credits will be added after admin approval.");
    setTxn("");
    setSelected(null);
    load();
  }
  return (
    <main className="module-page">
      <header>
        <Link href="/">← Dashboard</Link>
        <b>Drishyana Credits</b>
        <span>{balance.toLocaleString()} credits</span>
      </header>
      <section>
        <p className="eyebrow">₹10 = 100 CREDITS = 1 VIDEO MINUTE</p>
        <h1>Buy creation credits</h1>
        <p>
          Scan the QR, pay the exact amount, then submit the transaction ID.
          Credits remain pending until an admin approves the payment.
        </p>
        {msg && <div className="success-note">{msg}</div>}
        <div className="package-grid">
          {packs.map((p) => (
            <article key={p.id}>
              <b>{p.name}</b>
              <strong>₹{p.priceInPaise / 100}</strong>
              <span>
                {p.credits.toLocaleString()} credits · approximately{" "}
                {p.credits / 100} video minutes
              </span>
              <button onClick={() => choose(p)}>Pay with QR</button>
            </article>
          ))}
        </div>
        {selected && (
          <div className="payment-modal">
            <div>
              <button className="modal-x" onClick={() => setSelected(null)}>
                ×
              </button>
              <h2>Pay ₹{selected.priceInPaise / 100}</h2>
              <p>Scan using any UPI application</p>
              <img src={qr} alt="UPI payment QR" />
              <code>{process.env.NEXT_PUBLIC_UPI_ID ?? "vaaniframe@upi"}</code>
              <input
                value={txn}
                onChange={(e) => setTxn(e.target.value)}
                placeholder="Enter transaction / UTR ID"
              />
              <button onClick={submit}>Submit for admin approval</button>
            </div>
          </div>
        )}
        <h2 className="history-title">Payment requests</h2>
        <div className="purchase-history">
          {purchases.map((p) => (
            <div key={p.id}>
              <span>
                <b>{p.package.name}</b>
                <small>{p.transactionId}</small>
              </span>
              <strong className={`status ${p.status.toLowerCase()}`}>
                {p.status}
              </strong>
              <small>{new Date(p.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
