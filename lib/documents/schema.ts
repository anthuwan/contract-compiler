import { z } from "zod";

const optionalText = (max = 500) =>
  z.string().trim().max(max).nullable().optional();

const optionalAmount = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replaceAll(",", ""));
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z.number().finite().nonnegative().nullable().optional(),
);

export const DocumentTypeSchema = z.enum([
  "AGREEMENT",
  "PURCHASE_ORDER",
  "FULFILLMENT_EVIDENCE",
]);

export const EvidenceSchema = z.object({
  field: z.string().trim().min(1).max(120),
  page: z.number().int().min(1).max(10_000),
  quote: z.string().trim().min(1).max(800),
});

export const MilestoneSchema = z.object({
  id: optionalText(120),
  title: z.string().trim().min(1).max(240),
  amount: optionalAmount,
  dueDate: optionalText(64),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

export const DocumentAnalysisSchema = z.object({
  documentType: DocumentTypeSchema,
  summary: z.string().trim().min(1).max(1_500),
  parties: z
    .object({
      providerName: optionalText(240),
      customerName: optionalText(240),
      billingEmail: optionalText(320),
    })
    .default({}),
  commercialTerms: z
    .object({
      currency: optionalText(12),
      total: optionalAmount,
      depositPercent: optionalAmount,
      depositAmount: optionalAmount,
      remainingAmount: optionalAmount,
      paymentTerms: optionalText(500),
      purchaseOrderNumber: optionalText(120),
      effectiveDate: optionalText(64),
      dueDate: optionalText(64),
    })
    .default({}),
  deliverables: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
  milestones: z.array(MilestoneSchema).max(30).default([]),
  fulfillment: z
    .object({
      milestoneReference: optionalText(120),
      accepted: z.boolean().nullable().optional(),
      acceptedBy: optionalText(240),
      acceptedAt: optionalText(64),
    })
    .default({}),
  evidence: z.array(EvidenceSchema).max(80).default([]),
  warnings: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  confidence: z.number().finite().min(0).max(1),
});

export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

export type AnalyzedDocument = DocumentAnalysis & {
  id: string;
  fileName: string;
};

export type ReconciliationCheck = {
  code: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  documentIds: string[];
  fieldPaths: string[];
  expected?: number | string;
  actual?: number | string;
};

export type ReconciliationResult = {
  checks: ReconciliationCheck[];
  readyForPayment: boolean;
  proposedPayment: {
    action: "REVIEW" | "AUTHORIZE_ORDER" | "CREATE_INVOICE" | "CAPTURE_AUTHORIZATION";
    amount: number | null;
    currency: string | null;
    description: string;
  };
};
