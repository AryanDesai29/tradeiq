import React from "react";

// Stops a single render error from blanking the whole app (what the
// "React is not defined" crash did). Local backup keeps data safe.
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[TradeIQ] render error:", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", background: "#0a101e", color: "#e9f0fc", fontFamily: "'JetBrains Mono',monospace", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, border: "1px solid #26354f", borderRadius: 12, padding: 24, background: "#0e1628" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#ff6b61", marginBottom: 10 }}>Something broke</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#8298b8", marginBottom: 16 }}>
            TradeIQ hit a rendering error and stopped instead of showing a blank screen. Your saved data is safe in local backup — reload to recover.
          </div>
          <pre style={{ fontSize: 12, color: "#fb923c", background: "#131d33", padding: 12, borderRadius: 8, overflowX: "auto", marginBottom: 16, whiteSpace: "pre-wrap" }}>{String(this.state.error?.message || this.state.error)}</pre>
          <button onClick={() => location.reload()} style={{ background: "#f0b441", border: "none", borderRadius: 8, color: "#0a101e", fontWeight: 800, fontSize: 12, padding: "10px 18px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>Reload</button>
        </div>
      </div>
    );
  }
}
