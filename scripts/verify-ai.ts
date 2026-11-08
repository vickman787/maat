import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "../lib/db";
import { aiConfig } from "../lib/config";
import { explainException } from "../lib/ai";
async function main() {
  const db=openDatabase(":memory:");
  try {
    if (!aiConfig().configured) throw new Error("Configure AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local first.");
    const result=await explainException(db,{
      invoice:{row_id:"sample-invoice-10",invoice_id:"INV-010",customer_name:"Orbit Creative",amount_minor:150000,currency:"USD",due_date:"2026-11-07",source_file:"invoices-sample.csv",source_row:10},
      candidates:[{row_id:"sample-payment-10",payment_id:"P010",payer_name:"Orbit Creative",amount_minor:100000,currency:"USD",reference:"INV-010",paid_at:"2026-11-06",source_file:"payments-sample.csv",source_row:10,signals:{reference_exact:true}}],
      deterministic:{suggestion_type:"partial",rule_reason:"Exact reference; payment is USD 500 below the invoice. Human confirmation is required.",difference_minor:50000},
    });
    const evidence={verified_at:new Date().toISOString(),fixture:"fictional canonical partial payment",...result};
    fs.mkdirSync(path.resolve("data"),{recursive:true});
    fs.writeFileSync(path.resolve("data/ai-verification.json"),JSON.stringify(evidence,null,2),{mode:0o600});
    console.log(JSON.stringify(evidence,null,2));
    if(result.status!=="success")process.exitCode=1;
  } finally { db.close(); }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Provider verification failed.");process.exitCode=1;});
