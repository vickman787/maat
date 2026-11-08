import Link from "next/link";
import { Download } from "lucide-react";

export function DemoLinkNote() {
  return (
    <div className="notice" style={{ textAlign: "left" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        This demo is still preparing its sample batch. If this message stays after a moment, the
        reconciliation worker may not be running on the server.
      </p>
      <div className="row">
        <a className="text-link" href="/samples/invoices-sample.csv" download>
          <Download size={13} /> invoices-sample.csv
        </a>
        <a className="text-link" href="/samples/payments-sample.csv" download>
          <Download size={13} /> payments-sample.csv
        </a>
        <Link className="text-link" href="/dashboard">
          Refresh dashboard →
        </Link>
      </div>
    </div>
  );
}
