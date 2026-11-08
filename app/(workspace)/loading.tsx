export default function Loading() {
  return (
    <div className="loading-page" role="status" aria-label="Loading">
      <div className="skeleton" style={{ height: 22, width: "22%" }} />
      <div className="skeleton" style={{ height: 48, width: "55%" }} />
      <div className="stat-grid" style={{ marginTop: "1rem" }}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton" style={{ height: 122 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
