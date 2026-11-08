import { describe, it, expect } from "vitest";
import { makeDb, createAccount, importFixture, contextFor } from "./helpers";
import { claimJob, recoverInterruptedJobs, processQueuedJob } from "../lib/jobs";
import { getBatchOverview } from "../lib/batches";
import { performReview } from "../lib/review";
import { parseAmountToMinor } from "../lib/money";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../lib/db";
import { planMatching } from "../lib/matching";
import { importBatch } from "../lib/importer";
import { FIXTURE_INVOICE_MAPPING, FIXTURE_PAYMENT_MAPPING } from "./fixtures/canonical";

describe("submission regression coverage", () => {
  it("recovers a recently claimed job on single-worker startup", () => {
    const db=makeDb(); const account=createAccount(db); const batch=importFixture(db,account.workspaceId);
    claimJob(db,batch.jobId);
    expect(recoverInterruptedJobs(db,true)).toBe(1);
    expect(db.prepare("SELECT status FROM jobs WHERE id = ?").get(batch.jobId)).toEqual({status:"queued"});
    db.close();
  });
  it.each(["1,50", "12,34.56", "1,,500", "1500,000"])("rejects malformed monetary grouping %s", (value) => {
    expect(parseAmountToMinor(value,"USD").ok).toBe(false);
  });
  it("does not call manually settled invoices exact reference matches", async () => {
    const db=makeDb(); const a=createAccount(db); const b=importFixture(db,a.workspaceId);
    await processQueuedJob(db,b.jobId);
    const before=getBatchOverview(db,a.workspaceId,b.batchId)!;
    const invoice=before.invoices.find(x=>x.invoiceId==="INV-011")!;
    const payment=before.payments.find(x=>x.paymentId==="P011")!;
    performReview(db,contextFor(db,a.userId,a.workspaceId),a.workspaceId,b.batchId,invoice.id,{action:"manual_allocate",paymentRowId:payment.id,amount:"1500.00"});
    const after=getBatchOverview(db,a.workspaceId,b.batchId)!;
    expect(after.summary.exact_count).toBe(9);
    expect(after.invoices.find(x=>x.id===invoice.id)?.status).toBe("settled");
    expect(after.invoices[0].originalValues.invoice_id).toBe("INV-001");
    db.close();
  });
  it("prepares every exception beyond the former ten-item cap", async () => {
    const db=makeDb();const a=createAccount(db);
    const invoices="invoice_id,customer_name,amount,currency,due_date\n"+Array.from({length:12},(_,i)=>"INV-"+i+",Customer "+i+",100.00,USD,2026-11-08").join("\n");
    const b=importBatch(db,a.workspaceId,{name:"Many exceptions",currency:"USD",invoices:{filename:"invoices.csv",mimeType:"text/csv",bytes:Buffer.from(invoices)},payments:{filename:"payments.csv",mimeType:"text/csv",bytes:Buffer.from("payment_id,payer_name,amount,currency,reference,paid_at\nP1,Other,10.00,USD,,2026-01-01")},invoiceMapping:FIXTURE_INVOICE_MAPPING,paymentMapping:FIXTURE_PAYMENT_MAPPING});
    await processQueuedJob(db,b.jobId);
    expect(db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE batch_id = ? AND ai_status = 'unavailable'").get(b.batchId)).toEqual({n:12});
    db.close();
  });
  it("does not reuse an allocated overpayment remainder as a new candidate", async () => {
    const db=makeDb(); const a=createAccount(db); const b=importFixture(db,a.workspaceId);
    await processQueuedJob(db,b.jobId);
    const o=getBatchOverview(db,a.workspaceId,b.batchId)!;
    const p=o.payments.find(x=>x.paymentId==="P011")!;
    const i=o.invoices.find(x=>x.invoiceId==="INV-011")!;
    performReview(db,contextFor(db,a.userId,a.workspaceId),a.workspaceId,b.batchId,i.id,{action:"manual_allocate",paymentRowId:p.id,amount:"1500.00"});
    expect(getBatchOverview(db,a.workspaceId,b.batchId)!.payments.find(x=>x.id===p.id)?.remainingMinor).toBe(50000);
    const plan=planMatching([{id:"other",invoiceId:"OTHER",customerName:p.payerName,amountMinor:50000,dueDate:null}],
      [{id:p.id,paymentId:p.paymentId,payerName:p.payerName,amountMinor:p.amountMinor,reference:null,paidAt:null}],
      [{invoiceRowId:i.id,paymentRowId:p.id,amountMinor:150000}],"USD");
    expect(plan.allocations).toHaveLength(0);
    expect(plan.suggestions[0].paymentRowId).toBeNull();
    db.close();
  });

  it("serializes concurrent confirmations from separate processes", async () => {
    const file=path.join(os.tmpdir(), "maat-concurrent-"+randomUUID()+".db");
    const db=openDatabase(file); const a=createAccount(db); const b=importFixture(db,a.workspaceId);
    await processQueuedJob(db,b.jobId);
    const invoice=getBatchOverview(db,a.workspaceId,b.batchId)!.invoices.find(x=>x.invoiceId==="INV-010")!;
    const payload={file,ctx:contextFor(db,a.userId,a.workspaceId),workspaceId:a.workspaceId,batchId:b.batchId,invoiceId:invoice.id,suggestionId:invoice.suggestion!.id};
    const script=`const input=JSON.parse(process.argv[1]); const {openDatabase}=require('./lib/db.ts'); const {performReview}=require('./lib/review.ts'); const db=openDatabase(input.file);try{performReview(db,input.ctx,input.workspaceId,input.batchId,input.invoiceId,{action:'confirm',suggestionId:input.suggestionId}); console.log('confirmed');}catch(error){if(error.status===409)console.log('conflict');else throw error;}finally{db.close();}`;
    const run=promisify(execFile);
    const results=await Promise.all([1,2].map(()=>run(process.execPath,["--import","tsx","-e",script,JSON.stringify(payload)],{cwd:process.cwd(),windowsHide:true})));
    expect(results.map(x=>x.stdout.trim()).sort()).toEqual(["confirmed","conflict"]);
    expect(getBatchOverview(db,a.workspaceId,b.batchId)!.summary.confirmed_minor).toBe(1450000);
    db.close();
  }, 30000);
});
