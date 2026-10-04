export default function Loading() {
  return (
    <main style={{ minHeight: '100vh', padding: 20 }} aria-busy="true" aria-live="polite">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="skeleton-bar" style={{ width: 160, height: 18, marginBottom: 20 }} />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card-flat skeleton-card"
              style={{ padding: 16, marginBottom: 10, height: 60 }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.9; }
        }
        .skeleton-bar {
          background: var(--surface-3);
          border-radius: 6px;
          animation: sk-pulse 1.4s ease-in-out infinite;
        }
        .skeleton-card {
          background: var(--surface-2);
          animation: sk-pulse 1.4s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
