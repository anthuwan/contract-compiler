import type { AnalyzedDocument } from "@/lib/documents/schema";

function suppliedName(files: File[], index: number, fallback: string) {
  const name = files[index]?.name
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return name || fallback;
}

export function createDemoDocuments(files: File[]): AnalyzedDocument[] {
  const agreement: AnalyzedDocument = {
    id: "demo-agreement",
    fileName: suppliedName(files, 0, "Northstar-launch-SOW.pdf"),
    documentType: "AGREEMENT",
    summary:
      "Statement of work for a product launch video with a stated $3,000 contract value and two payment milestones.",
    parties: {
      providerName: "Beacon Creative Studio",
      customerName: "Northstar Labs",
      billingEmail: "ap@northstarlabs.example",
    },
    commercialTerms: {
      currency: "USD",
      total: 3_000,
      depositPercent: 30,
      depositAmount: 800,
      remainingAmount: 2_100,
      paymentTerms: "30% deposit, remainder after written acceptance",
      effectiveDate: "2026-11-09",
      dueDate: "2026-11-30",
    },
    deliverables: [
      "One 60-second product launch video",
      "Two social cut-downs",
      "Final exports in 4K and vertical formats",
    ],
    milestones: [
      {
        id: "M1",
        title: "Project kickoff deposit",
        amount: 800,
        dueDate: "2026-11-09",
        acceptanceCriteria: ["Signed statement of work"],
      },
      {
        id: "M2",
        title: "Final delivery",
        amount: 2_100,
        dueDate: "2026-11-30",
        acceptanceCriteria: [
          "All three deliverables supplied",
          "Written acceptance from Northstar Labs",
        ],
      },
    ],
    fulfillment: {},
    evidence: [
      {
        field: "commercialTerms.total",
        page: 1,
        quote: "Total project fee: USD 3,000",
      },
      {
        field: "commercialTerms.depositPercent",
        page: 1,
        quote: "A 30% deposit is due at project kickoff.",
      },
      {
        field: "commercialTerms.depositAmount",
        page: 1,
        quote: "Kickoff deposit: USD 800",
      },
      {
        field: "commercialTerms.remainingAmount",
        page: 1,
        quote: "Balance on final acceptance: USD 2,100",
      },
    ],
    warnings: ["The deposit percentage and written amount may conflict."],
    confidence: 0.98,
  };

  const purchaseOrder: AnalyzedDocument = {
    id: "demo-purchase-order",
    fileName: suppliedName(files, 1, "Northstar-PO-1048.pdf"),
    documentType: "PURCHASE_ORDER",
    summary:
      "Purchase order authorizing $3,000 for the Northstar launch video engagement.",
    parties: {
      providerName: "Beacon Creative Studio",
      customerName: "Northstar Labs",
      billingEmail: "ap@northstarlabs.example",
    },
    commercialTerms: {
      currency: "USD",
      total: 3_000,
      paymentTerms: "Payment against the approved statement of work",
      purchaseOrderNumber: "PO-1048",
      effectiveDate: "2026-11-09",
      dueDate: "2026-11-30",
    },
    deliverables: ["Launch video production per approved statement of work"],
    milestones: [],
    fulfillment: {},
    evidence: [
      {
        field: "commercialTerms.purchaseOrderNumber",
        page: 1,
        quote: "Purchase Order PO-1048",
      },
      {
        field: "commercialTerms.total",
        page: 1,
        quote: "Authorized amount: USD 3,000",
      },
    ],
    warnings: [],
    confidence: 0.99,
  };

  const documents = [agreement, purchaseOrder];

  if (files.length >= 3) {
    documents.push({
      id: "demo-fulfillment",
      fileName: suppliedName(files, 2, "Northstar-acceptance.pdf"),
      documentType: "FULFILLMENT_EVIDENCE",
      summary: "Signed acceptance for milestone M2.",
      parties: {
        providerName: "Beacon Creative Studio",
        customerName: "Northstar Labs",
      },
      commercialTerms: { currency: "USD" },
      deliverables: ["Launch video and two social cut-downs"],
      milestones: [],
      fulfillment: {
        milestoneReference: "M2",
        accepted: true,
        acceptedBy: "Maya Chen, Northstar Labs",
        acceptedAt: "2026-11-30",
      },
      evidence: [
        {
          field: "fulfillment.accepted",
          page: 1,
          quote: "Milestone M2 is accepted in full.",
        },
      ],
      warnings: [],
      confidence: 0.97,
    });
  }

  return documents;
}
