import { Check } from "lucide-react";

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Upload files", "Review matches", "Export report"];
  return (
    <div className="steps" aria-label={`Step ${current} of 3`}>
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const state = step < current ? "done" : step === current ? "current" : "";
        return (
          <div key={label} style={{ display: "contents" }}>
            {index > 0 && <div className="step-line" aria-hidden="true" />}
            <div className={`step ${state}`} aria-current={step === current ? "step" : undefined}>
              <span className="step-index">
                {step < current ? <Check size={13} aria-hidden="true" /> : step}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
