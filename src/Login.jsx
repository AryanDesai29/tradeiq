// Minimal Google sign-in gate for a private 1-2 user tool.
const C = {
  bg: "#0a101e", s1: "#0e1628", border: "#26354f", accent: "#f0b441",
  blue: "#5b9bff", text: "#e9f0fc", muted: "#8298b8",
  display: "'Syne',sans-serif", mono: "'JetBrains Mono',monospace",
  serif: "'Fraunces',serif",
};

export default function Login({ onSignIn }) {
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(900px 460px at 50% -10%, #16203a 0%, transparent 60%), ${C.bg}`, color: C.text, fontFamily: C.mono, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, background: C.s1, textAlign: "center", boxShadow: "inset 0 1px 0 #ffffff09, 0 24px 60px #00000066" }}>
        <div style={{ fontFamily: C.serif, fontWeight: 900, fontSize: 32, background: `linear-gradient(95deg,${C.accent},#ffd98a)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>TradeIQ</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 28, lineHeight: 1.6 }}>
          Private AI trading workspace.<br />Sign in to access your portfolio, journal &amp; AI advisor.
        </div>
        <button
          onClick={onSignIn}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", color: "#1f1f1f", border: "none", borderRadius: 8, padding: "12px 16px", fontFamily: C.display, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 18, lineHeight: 1.6 }}>
          Access is limited to approved accounts. Not financial advice.
        </div>
      </div>
    </div>
  );
}
