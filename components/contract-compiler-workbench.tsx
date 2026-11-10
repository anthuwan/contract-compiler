"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Files,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ScanText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Workflow,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  PayPalV6Authorization,
  type PayPalAuthorizationStatus,
} from "@/components/paypal-v6-authorization";
import type {
  AnalyzedDocument,
  ReconciliationResult,
} from "@/lib/documents/schema";

type AnalysisStage = "ready" | "analyzing" | "review" | "approved";
type DocumentSlot = "agreement" | "purchaseOrder";
type CaptureStatus = "idle" | "capturing" | "captured" | "error";

const seededFiles: Record<DocumentSlot, string> = {
  agreement: "Northstar_campaign_SOW.pdf",
  purchaseOrder: "PO-2026-1842.pdf",
};

const seededExtractedFields = [
  ["Engagement total", "$3,000.00 USD", "SOW · page 2, §4.1", "99%"],
  ["Approved PO value", "$3,000.00 USD", "PO · page 1, total", "99%"],
  ["Deposit term", "30% · written as $800", "SOW · page 2, §4.2", "97%"],
  ["Final milestone", "$2,100 on acceptance", "SOW · page 3, milestone 2", "96%"],
];

type AnalysisResponse = {
  mode: "demo" | "bedrock";
  documents: AnalyzedDocument[];
  reconciliation: ReconciliationResult;
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function evidenceLabel(document: AnalyzedDocument | undefined, field: string) {
  const evidence = document?.evidence.find((item) => item.field === field);
  if (!evidence) return "No source quotation returned";
  return `${document?.documentType.replaceAll("_", " ")} · page ${evidence.page}: ${evidence.quote}`;
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {children}
    </span>
  );
}

function DocumentCard({
  slot,
  label,
  category,
  fileName,
  inputId,
  onFile,
}: {
  slot: DocumentSlot;
  label: string;
  category: string;
  fileName: string;
  inputId: string;
  onFile: (slot: DocumentSlot, file: File) => void;
}) {
  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgb(16_35_56/3%)] transition hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(16_35_56/7%)]">
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-blue-50 group-hover:text-blue-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{fileName}</p>
            </div>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-label="Ready" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-[10px] font-semibold tracking-wide text-blue-700">{category}</span>
            <label htmlFor={inputId} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              Replace
            </label>
            <input
              id={inputId}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(slot, file);
              }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export function ContractCompilerWorkbench() {
  const agreementId = useId();
  const purchaseOrderId = useId();
  const [stage, setStage] = useState<AnalysisStage>("review");
  const [documents, setDocuments] = useState(seededFiles);
  const [selectedFiles, setSelectedFiles] = useState<
    Partial<Record<DocumentSlot, File>>
  >({});
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [deposit, setDeposit] = useState(900);
  const [notice, setNotice] = useState(
    "Sample analysis is loaded. Replace either PDF to run your own document set.",
  );
  const [paymentStatus, setPaymentStatus] =
    useState<PayPalAuthorizationStatus>("idle");
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [acceptanceReviewed, setAcceptanceReviewed] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("idle");
  const [captureId, setCaptureId] = useState<string | null>(null);

  const agreement = analysis?.documents.find(
    (document) => document.documentType === "AGREEMENT",
  );
  const purchaseOrder = analysis?.documents.find(
    (document) => document.documentType === "PURCHASE_ORDER",
  );
  const total = analysis ? (agreement?.commercialTerms.total ?? 0) : 3000;
  const depositPercent = analysis
    ? (agreement?.commercialTerms.depositPercent ?? 0)
    : 30;
  const sourceDeposit = analysis
    ? (agreement?.commercialTerms.depositAmount ?? 0)
    : 800;
  const sourceRemaining = analysis
    ? (agreement?.commercialTerms.remainingAmount ?? 0)
    : 2100;
  const rawCurrency =
    agreement?.commercialTerms.currency ??
    purchaseOrder?.commercialTerms.currency ??
    "USD";
  const currency = /^[A-Za-z]{3}$/.test(rawCurrency)
    ? rawCurrency.toUpperCase()
    : "USD";
  const referenceId =
    purchaseOrder?.commercialTerms.purchaseOrderNumber ?? "CC-2048";
  const customerName =
    agreement?.parties.customerName ?? "Northstar Labs";
  const expectedDeposit = Number(
    ((total * depositPercent) / 100).toFixed(2),
  );
  const balance = useMemo(
    () => Math.max(0, Number((total - deposit).toFixed(2))),
    [deposit, total],
  );
  const corrected =
    total > 0 && Math.abs(deposit - expectedDeposit) < 0.005;
  const approved = stage === "approved";
  const extractedFields = useMemo(() => {
    if (!analysis) return seededExtractedFields;
    const agreementConfidence = agreement
      ? `${Math.round(agreement.confidence * 100)}%`
      : "—";
    const poConfidence = purchaseOrder
      ? `${Math.round(purchaseOrder.confidence * 100)}%`
      : "—";
    return [
      [
        "Engagement total",
        total > 0 ? formatMoney(total, currency) : "Not extracted",
        evidenceLabel(agreement, "commercialTerms.total"),
        agreementConfidence,
      ],
      [
        "Approved PO value",
        purchaseOrder?.commercialTerms.total != null
          ? formatMoney(purchaseOrder.commercialTerms.total, currency)
          : "Not extracted",
        evidenceLabel(purchaseOrder, "commercialTerms.total"),
        poConfidence,
      ],
      [
        "Deposit term",
        `${depositPercent}% · written as ${formatMoney(sourceDeposit, currency)}`,
        evidenceLabel(agreement, "commercialTerms.depositAmount"),
        agreementConfidence,
      ],
      [
        "Final milestone",
        `${formatMoney(sourceRemaining, currency)} on acceptance`,
        evidenceLabel(agreement, "commercialTerms.remainingAmount"),
        agreementConfidence,
      ],
    ];
  }, [
    agreement,
    analysis,
    currency,
    depositPercent,
    purchaseOrder,
    sourceDeposit,
    sourceRemaining,
    total,
  ]);

  function handleFile(slot: DocumentSlot, file: File) {
    setDocuments((current) => ({ ...current, [slot]: file.name }));
    setSelectedFiles((current) => ({ ...current, [slot]: file }));
    setStage("ready");
    setPaymentStatus("idle");
    setAuthorizationId(null);
    setAcceptanceReviewed(false);
    setCaptureStatus("idle");
    setCaptureId(null);
    setNotice("New document selected. Run analysis to reconcile the updated terms.");
  }

  async function handleAnalyze() {
    setStage("analyzing");
    setNotice("Classifying documents and reconciling commercial terms…");
    setPaymentStatus("idle");
    setAuthorizationId(null);
    setAcceptanceReviewed(false);
    setCaptureStatus("idle");
    setCaptureId(null);

    try {
      const formData = new FormData();
      if (selectedFiles.agreement) {
        formData.append("documents", selectedFiles.agreement);
      }
      if (selectedFiles.purchaseOrder) {
        formData.append("documents", selectedFiles.purchaseOrder);
      }

      const response = await fetch("/api/documents/analyze", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as AnalysisResponse & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "Document analysis could not be completed.",
        );
      }

      setAnalysis(payload);
      const analyzedAgreement = payload.documents.find(
        (document) => document.documentType === "AGREEMENT",
      );
      const analyzedTotal = analyzedAgreement?.commercialTerms.total ?? 0;
      const analyzedPercent =
        analyzedAgreement?.commercialTerms.depositPercent ?? 0;
      const correctedDeposit = Number(
        ((analyzedTotal * analyzedPercent) / 100).toFixed(2),
      );
      setDeposit(
        correctedDeposit > 0
          ? correctedDeposit
          : (analyzedAgreement?.commercialTerms.depositAmount ?? 0),
      );
      setStage("review");
      const findings = payload.reconciliation.checks.length;
      setNotice(
        `Analysis complete in ${payload.mode} mode. ${findings} reconciliation ${findings === 1 ? "finding needs" : "findings need"} review.`,
      );
    } catch (error) {
      setStage("ready");
      setNotice(
        error instanceof Error
          ? error.message
          : "Document analysis could not be completed.",
      );
    }
  }

  function handleApprove() {
    if (!corrected) {
      setNotice(
        `The deposit must equal ${depositPercent}% of the approved ${formatMoney(total, currency)} total.`,
      );
      return;
    }
    setStage("approved");
    setNotice("Plan approved. The PayPal JS SDK v6 authorization mount is ready.");
  }

  async function handleCapture() {
    if (!authorizationId || !acceptanceReviewed) return;

    setCaptureStatus("capturing");
    setNotice("Capturing the reviewed PayPal authorization…");

    try {
      const response = await fetch(
        `/api/paypal/authorizations/${encodeURIComponent(authorizationId)}/capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `capture-${authorizationId}`,
          },
          body: JSON.stringify({
            amount: { value: total.toFixed(2), currencyCode: currency },
            finalCapture: true,
            invoiceId: referenceId,
            noteToPayer: `Final capture for ${referenceId}`,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        capture?: { id?: unknown; status?: unknown };
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : `Capture failed with HTTP ${response.status}.`,
        );
      }
      if (typeof payload.capture?.id !== "string") {
        throw new Error("PayPal returned no capture ID.");
      }

      setCaptureId(payload.capture.id);
      setCaptureStatus("captured");
      setNotice(`PayPal capture ${payload.capture.id} completed.`);
    } catch (error) {
      setCaptureStatus("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "The PayPal authorization could not be captured.",
      );
    }
  }

  const steps = [
    {
      icon: Files,
      label: "Documents",
      detail: `${analysis?.documents.length ?? 2} ready`,
      done: true,
    },
    {
      icon: ScanText,
      label: "Reconciliation",
      detail: `${analysis?.reconciliation.checks.length ?? 2} findings`,
      done: true,
    },
    { icon: ShieldCheck, label: "Approval", detail: approved ? "Approved" : "Your review", done: approved },
    {
      icon: CircleDollarSign,
      label: "Payment",
      detail:
        captureStatus === "captured"
          ? "Captured"
          : paymentStatus === "authorized"
          ? "Authorized"
          : paymentStatus === "ready"
            ? "Ready"
            : "Not started",
      done: captureStatus === "captured",
    },
  ];

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="border-b border-slate-700 bg-[#102338] text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-5 py-5 lg:py-7">
          <div className="flex items-center justify-between lg:block">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500 shadow-[0_8px_24px_rgb(19_94_232/32%)]">
                <Workflow className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-bold tracking-tight">Contract Compiler</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Document to transaction</p>
              </div>
            </div>
            <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-200 lg:mt-7 lg:inline-flex">Prototype</span>
          </div>

          <nav aria-label="Workflow progress" className="mt-6 hidden lg:block">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Engagement workflow</p>
            <ol className="space-y-1.5">
              {steps.map(({ icon: Icon, label, detail, done }) => (
                <li key={label}>
                  <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${done ? "bg-white/10" : "text-slate-400"}`}>
                    <Icon className={`h-4 w-4 ${done ? "text-blue-300" : ""}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${done ? "text-white" : ""}`}>{label}</p>
                      <p className="text-[11px] text-slate-400">{detail}</p>
                    </div>
                    {done ? <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> : null}
                  </div>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-auto hidden rounded-2xl border border-slate-600/70 bg-slate-800/60 p-4 lg:block">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden="true" /> Guarded execution
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Only reviewed, validated fields can reach the payment layer.</p>
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-slate-200/80 bg-white/75 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">Northstar campaign</p>
                <p className="font-mono text-[10px] font-semibold tracking-wide text-slate-500">CC-2048 · ACME STUDIO</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <StatusPill>Sandbox</StatusPill>
              <span className="hidden text-xs font-semibold text-slate-500 sm:block">Last saved just now</span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-blue-700"><Sparkles className="h-4 w-4" aria-hidden="true" /> AI review complete</div>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-slate-950 sm:text-4xl lg:text-[46px] lg:leading-[1.04]">
                One deal. Two documents.<span className="block text-slate-400">Two conflicts to resolve.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-[15px]">The agent linked the SOW to its purchase order, traced every commercial field, and prepared a guarded transaction plan.</p>
            </div>
            <button type="button" onClick={handleAnalyze} disabled={stage === "analyzing"} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70">
              {stage === "analyzing" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {stage === "analyzing" ? "Analyzing" : "Run analysis"}
            </button>
          </div>

          <div role="status" aria-live="polite" className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
            {stage === "analyzing" ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <Fingerprint className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <p className="leading-5">{notice}</p>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <section aria-labelledby="documents-heading" className="rounded-[22px] border border-slate-200 bg-[#fbfcfc] p-4 shadow-[0_18px_50px_rgb(16_35_56/5%)] sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h2 id="documents-heading" className="text-base font-bold text-slate-950">Source documents</h2><p className="mt-1 text-xs text-slate-500">Original values remain immutable in the audit record.</p></div>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
                    <UploadCloud className="h-4 w-4" aria-hidden="true" /> Add document
                    <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile("agreement", file); }} />
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <DocumentCard slot="agreement" label="Source 01" category="AGREEMENT" fileName={documents.agreement} inputId={agreementId} onFile={handleFile} />
                  <DocumentCard slot="purchaseOrder" label="Source 02" category="PURCHASE_ORDER" fileName={documents.purchaseOrder} inputId={purchaseOrderId} onFile={handleFile} />
                </div>
              </section>

              <section aria-labelledby="review-heading" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_50px_rgb(16_35_56/5%)]">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <div className="flex items-center gap-2"><h2 id="review-heading" className="text-base font-bold text-slate-950">Reconciliation review</h2><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Action needed</span></div>
                    <p className="mt-1 text-xs text-slate-500">AI findings remain suggestions until a human confirms them.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Deterministic totals checked</div>
                </div>

                <div className="grid divide-y divide-slate-200 lg:grid-cols-[minmax(0,1fr)_250px] lg:divide-x lg:divide-y-0">
                  <div className="p-5 sm:p-6">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/75 p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>
                        <div><p className="text-sm font-bold text-amber-950">Deposit conflicts with its percentage</p><p className="mt-1 text-xs leading-5 text-amber-900/75">The agreement states {depositPercent}% of {formatMoney(total, currency)}, but writes {formatMoney(sourceDeposit, currency)}. Its listed schedule totals {formatMoney(sourceDeposit + sourceRemaining, currency)}.</p></div>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="deposit" className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Corrected deposit</label>
                        <div className="mt-2 flex h-12 items-center rounded-xl border border-slate-300 bg-white px-3 shadow-inner focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                          <span className="text-sm font-bold text-slate-400">$</span>
                          <input id="deposit" type="number" min={0} max={total} value={deposit} onChange={(event) => setDeposit(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-2 text-base font-bold text-slate-950 outline-none" />
                          <span className="text-xs font-bold text-slate-400">{currency}</span>
                        </div>
                        <p className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${corrected ? "text-emerald-700" : "text-amber-700"}`}>{corrected ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{corrected ? `Matches ${depositPercent}% of approved total` : `Expected ${formatMoney(expectedDeposit, currency)}`}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Remaining milestone</p>
                        <div className="mt-2 flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3"><span className="text-base font-bold text-slate-950">{formatMoney(balance, currency)}</span><span className="text-xs font-bold text-slate-400">{currency}</span></div>
                        <p className="mt-2 text-xs text-slate-500">Calculated from the approved total.</p>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <button type="button" className="text-xs font-bold text-slate-500 hover:text-slate-900">Mark for manual review</button>
                      <button type="button" onClick={handleApprove} disabled={!corrected || approved} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgb(19_94_232/22%)] hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                        {approved ? <Check className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}{approved ? "Plan approved" : "Approve transaction plan"}
                      </button>
                    </div>
                  </div>
                  <aside className="bg-slate-50/65 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Payment schedule</p>
                    <div className="mt-4 space-y-5">
                      {[{ label: "Deposit", amount: deposit, color: "bg-blue-500" }, { label: "On acceptance", amount: balance, color: "bg-slate-700" }].map((item) => (
                        <div key={item.label} className="border-b border-slate-200 pb-4 last:border-0">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>{item.label}</span><span>{total > 0 ? Math.round((item.amount / total) * 100) : 0}%</span></div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${total > 0 ? Math.min(100, (item.amount / total) * 100) : 0}%` }} /></div>
                          <p className="mt-2 text-lg font-bold text-slate-950">{formatMoney(item.amount, currency)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3"><span className="text-xs font-semibold text-slate-500">Plan total</span><span className="text-sm font-black text-slate-950">{formatMoney(deposit + balance, currency)}</span></div>
                  </aside>
                </div>
              </section>

              <section aria-labelledby="evidence-heading" className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgb(16_35_56/5%)] sm:p-6">
                <div className="flex items-center justify-between gap-3"><div><h2 id="evidence-heading" className="text-base font-bold text-slate-950">Extracted terms and evidence</h2><p className="mt-1 text-xs text-slate-500">Every value remains traceable to its uploaded source.</p></div><FileCheck2 className="h-5 w-5 text-slate-400" aria-hidden="true" /></div>
                <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                  <div className="hidden grid-cols-[1fr_1fr_1.2fr_64px] gap-4 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:grid"><span>Field</span><span>Extracted value</span><span>Source evidence</span><span className="text-right">Conf.</span></div>
                  {extractedFields.map(([label, value, evidence, confidence]) => (
                    <div key={label} className="grid gap-1 border-t border-slate-200 px-4 py-3.5 first:border-t-0 sm:grid-cols-[1fr_1fr_1.2fr_64px] sm:items-center sm:gap-4">
                      <p className="text-xs font-bold text-slate-700">{label}</p><p className="text-sm font-semibold text-slate-950">{value}</p><p className="text-xs text-slate-500">{evidence}</p><p className="text-xs font-bold text-emerald-700 sm:text-right">{confidence}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <section aria-labelledby="payment-heading" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_50px_rgb(16_35_56/7%)]">
                <div className="border-b border-slate-200 bg-[#102338] px-5 py-5 text-white">
                  <div className="flex items-center justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-blue-200"><CircleDollarSign className="h-5 w-5" aria-hidden="true" /></span><span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200">Sandbox</span></div>
                  <h2 id="payment-heading" className="mt-5 text-lg font-bold">PayPal authorization</h2><p className="mt-1 text-xs leading-5 text-slate-300">Buyer approves the engagement. Capture remains human-controlled.</p>
                </div>
                <div className="p-5">
                  <div className="flex items-end justify-between border-b border-slate-200 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Authorization amount</p><p className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">{formatMoney(total, currency)}</p></div><span className="pb-1 text-xs font-bold text-slate-400">{currency}</span></div>
                  <dl className="space-y-3 py-5 text-xs">
                    <div className="flex items-center justify-between"><dt className="text-slate-500">Intent</dt><dd className="rounded-md bg-blue-50 px-2 py-1 font-mono font-bold text-blue-700">AUTHORIZE</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-slate-500">Reference</dt><dd className="font-mono font-bold text-slate-800">{referenceId}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-slate-500">Capture condition</dt><dd className="font-bold text-slate-800">Acceptance evidence</dd></div>
                  </dl>
                  <PayPalV6Authorization
                    enabled={approved && total > 0}
                    amount={total.toFixed(2)}
                    currency={currency}
                    description={`${customerName} engagement`}
                    referenceId={referenceId}
                    onStatus={(nextStatus, nextMessage) => {
                      setPaymentStatus(nextStatus);
                      if (nextStatus !== "ready") setNotice(nextMessage);
                    }}
                    onAuthorized={({ authorizationId: nextAuthorizationId }) => {
                      setAuthorizationId(nextAuthorizationId);
                      setAcceptanceReviewed(false);
                      setCaptureStatus("idle");
                      setCaptureId(null);
                      setNotice(
                        `PayPal authorization ${nextAuthorizationId} is ready for a separate capture approval.`,
                      );
                    }}
                  />
                  {authorizationId ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <p className="truncate text-center font-mono text-[10px] text-emerald-700">
                        Authorization: {authorizationId}
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-slate-700">
                        <input
                          type="checkbox"
                          checked={acceptanceReviewed}
                          disabled={captureStatus === "capturing" || captureStatus === "captured"}
                          onChange={(event) => setAcceptanceReviewed(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Acceptance evidence has been reviewed
                      </label>
                      <button
                        type="button"
                        disabled={!acceptanceReviewed || captureStatus === "capturing" || captureStatus === "captured"}
                        onClick={handleCapture}
                        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {captureStatus === "capturing" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : captureStatus === "captured" ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        )}
                        {captureStatus === "capturing"
                          ? "Capturing"
                          : captureStatus === "captured"
                            ? "Funds captured"
                            : "Approve final capture"}
                      </button>
                      {captureStatus === "error" ? (
                        <p className="mt-2 text-center text-[11px] font-semibold text-rose-700">
                          Capture failed. Review the message above and try again.
                        </p>
                      ) : null}
                      {captureId ? (
                        <p className="mt-2 truncate text-center font-mono text-[10px] text-emerald-700">
                          Capture: {captureId}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> No capture without a second approval</div>
                </div>
              </section>

              <section aria-labelledby="timeline-heading" className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgb(16_35_56/5%)]">
                <div className="flex items-center justify-between"><h2 id="timeline-heading" className="text-sm font-bold text-slate-950">Audit timeline</h2><Clock3 className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <ol className="mt-5">
                  {[
                    ["Documents classified", "Agreement and PO linked", true],
                    ["Terms reconciled", "Two inconsistencies found", true],
                    ["Human approval", approved ? "Corrected plan approved" : "Awaiting your review", approved],
                    [
                      "PayPal authorization",
                      paymentStatus === "authorized"
                        ? authorizationId ?? "Authorized"
                        : paymentStatus === "ready"
                          ? "Ready for buyer"
                          : "Not started",
                      paymentStatus === "authorized",
                    ],
                    [
                      "Final capture",
                      captureStatus === "captured"
                        ? captureId ?? "Captured"
                        : captureStatus === "capturing"
                          ? "Capture in progress"
                          : authorizationId
                            ? "Awaiting evidence approval"
                            : "Blocked until authorization",
                      captureStatus === "captured",
                    ],
                  ].map(([title, detail, done], index) => (
                    <li key={String(title)} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
                      {index < 4 ? <span className="absolute left-[9px] top-4 h-full w-px bg-slate-200" aria-hidden="true" /> : null}
                      {done ? <span className="relative z-10 grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3 w-3" aria-hidden="true" /></span> : <Circle className="relative z-10 h-5 w-5 fill-white text-slate-300" aria-hidden="true" />}
                      <div><p className={`text-xs font-bold ${done ? "text-slate-800" : "text-slate-500"}`}>{String(title)}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{String(detail)}</p></div>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>

          <footer className="mt-8 flex flex-col gap-3 border-t border-slate-200 py-6 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>AI-assisted extraction and consistency review · Human approval required</p>
            <p className="flex items-center gap-1.5 font-semibold">Bedrock document intelligence <ArrowRight className="h-3 w-3" aria-hidden="true" /> PayPal Sandbox</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
