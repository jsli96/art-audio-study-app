"use client";

type Props = {
  label: string;
  value?: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
};

export function Likert({ label, value, onChange, min = 1, max = 7 }: Props) {
  const items = [];
  for (let i = min; i <= max; i++) items.push(i);

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div className="row" role="radiogroup" aria-label={label}>
        {items.map((n) => (
          <label key={n} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="radio"
              name={label}
              checked={value === n}
              onChange={() => onChange(n)}
            />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <div className="small">1 = low, 7 = high</div>
    </div>
  );
}
