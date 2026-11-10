import type {
  AnalyzedDocument,
  ReconciliationCheck,
  ReconciliationResult,
} from "@/lib/documents/schema";

const MONEY_TOLERANCE = 0.01;

function differs(left: number, right: number) {
  return Math.abs(left - right) > MONEY_TOLERANCE;
}

function normalizedCurrency(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function finiteAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function reconcileDocuments(
  documents: AnalyzedDocument[],
): ReconciliationResult {
  const checks: ReconciliationCheck[] = [];
  const agreement = documents.find((doc) => doc.documentType === "AGREEMENT");
  const purchaseOrder = documents.find(
    (doc) => doc.documentType === "PURCHASE_ORDER",
  );
  const fulfillment = documents.find(
    (doc) => doc.documentType === "FULFILLMENT_EVIDENCE",
  );

  if (!agreement) {
    checks.push({
      code: "AGREEMENT_MISSING",
      severity: "error",
      title: "Agreement is missing",
      detail: "Upload a contract or statement of work before creating a payment plan.",
      documentIds: [],
      fieldPaths: [],
    });
  }

  if (!purchaseOrder) {
    checks.push({
      code: "PURCHASE_ORDER_MISSING",
      severity: "warning",
      title: "Purchase order is missing",
      detail: "The agreement cannot be reconciled against a buyer-approved amount.",
      documentIds: [],
      fieldPaths: [],
    });
  }

  for (const document of documents) {
    const terms = document.commercialTerms;

    if (
      finiteAmount(terms.total) &&
      finiteAmount(terms.depositPercent) &&
      finiteAmount(terms.depositAmount)
    ) {
      const expectedDeposit = Number(
        ((terms.total * terms.depositPercent) / 100).toFixed(2),
      );
      if (differs(expectedDeposit, terms.depositAmount)) {
        checks.push({
          code: "DEPOSIT_PERCENT_AMOUNT_MISMATCH",
          severity: "error",
          title: "Deposit percentage does not match amount",
          detail: `${terms.depositPercent}% of ${terms.total.toFixed(2)} is ${expectedDeposit.toFixed(2)}, not ${terms.depositAmount.toFixed(2)}.`,
          documentIds: [document.id],
          fieldPaths: [
            "commercialTerms.total",
            "commercialTerms.depositPercent",
            "commercialTerms.depositAmount",
          ],
          expected: expectedDeposit,
          actual: terms.depositAmount,
        });
      }
    }

    if (
      finiteAmount(terms.total) &&
      finiteAmount(terms.depositAmount) &&
      finiteAmount(terms.remainingAmount)
    ) {
      const componentTotal = Number(
        (terms.depositAmount + terms.remainingAmount).toFixed(2),
      );
      if (differs(componentTotal, terms.total)) {
        checks.push({
          code: "PAYMENT_COMPONENTS_TOTAL_MISMATCH",
          severity: "error",
          title: "Payment components do not equal contract total",
          detail: `The listed deposit and remaining amount total ${componentTotal.toFixed(2)}, while the document total is ${terms.total.toFixed(2)}.`,
          documentIds: [document.id],
          fieldPaths: [
            "commercialTerms.total",
            "commercialTerms.depositAmount",
            "commercialTerms.remainingAmount",
          ],
          expected: terms.total,
          actual: componentTotal,
        });
      }
    }

    if (finiteAmount(terms.total) && document.milestones.length > 0) {
      const milestoneAmounts = document.milestones
        .map((milestone) => milestone.amount)
        .filter(finiteAmount);
      if (milestoneAmounts.length === document.milestones.length) {
        const milestoneTotal = Number(
          milestoneAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2),
        );
        if (differs(milestoneTotal, terms.total)) {
          checks.push({
            code: "MILESTONES_TOTAL_MISMATCH",
            severity: "error",
            title: "Milestones do not equal contract total",
            detail: `Milestones total ${milestoneTotal.toFixed(2)}, while the document total is ${terms.total.toFixed(2)}.`,
            documentIds: [document.id],
            fieldPaths: ["milestones", "commercialTerms.total"],
            expected: terms.total,
            actual: milestoneTotal,
          });
        }
      }
    }

    const effectiveDate = parseDate(terms.effectiveDate);
    const dueDate = parseDate(terms.dueDate);
    if (effectiveDate !== null && dueDate !== null && dueDate < effectiveDate) {
      checks.push({
        code: "DUE_DATE_PRECEDES_EFFECTIVE_DATE",
        severity: "error",
        title: "Due date precedes effective date",
        detail: "The extracted due date occurs before the agreement becomes effective.",
        documentIds: [document.id],
        fieldPaths: ["commercialTerms.effectiveDate", "commercialTerms.dueDate"],
      });
    }

    for (const milestone of document.milestones) {
      const milestoneDueDate = parseDate(milestone.dueDate);
      if (
        effectiveDate !== null &&
        milestoneDueDate !== null &&
        milestoneDueDate < effectiveDate
      ) {
        checks.push({
          code: "MILESTONE_PRECEDES_EFFECTIVE_DATE",
          severity: "error",
          title: "Milestone precedes effective date",
          detail: `${milestone.title} is due before the document becomes effective.`,
          documentIds: [document.id],
          fieldPaths: ["commercialTerms.effectiveDate", "milestones.dueDate"],
        });
      }
      if (
        dueDate !== null &&
        milestoneDueDate !== null &&
        milestoneDueDate > dueDate
      ) {
        checks.push({
          code: "MILESTONE_AFTER_DOCUMENT_DUE_DATE",
          severity: "warning",
          title: "Milestone falls after document due date",
          detail: `${milestone.title} is scheduled after the document's stated due date.`,
          documentIds: [document.id],
          fieldPaths: ["commercialTerms.dueDate", "milestones.dueDate"],
        });
      }
    }

    if (document.confidence < 0.75) {
      checks.push({
        code: "LOW_EXTRACTION_CONFIDENCE",
        severity: "warning",
        title: "Review low-confidence extraction",
        detail: `Extraction confidence is ${Math.round(document.confidence * 100)}%.`,
        documentIds: [document.id],
        fieldPaths: ["confidence"],
      });
    }
  }

  if (agreement && purchaseOrder) {
    const agreementCurrency = normalizedCurrency(agreement.commercialTerms.currency);
    const poCurrency = normalizedCurrency(purchaseOrder.commercialTerms.currency);
    if (agreementCurrency && poCurrency && agreementCurrency !== poCurrency) {
      checks.push({
        code: "CURRENCY_MISMATCH",
        severity: "error",
        title: "Currencies do not match",
        detail: `The agreement uses ${agreementCurrency}, while the purchase order uses ${poCurrency}.`,
        documentIds: [agreement.id, purchaseOrder.id],
        fieldPaths: ["commercialTerms.currency"],
        expected: agreementCurrency,
        actual: poCurrency,
      });
    }

    const agreementTotal = agreement.commercialTerms.total;
    const poTotal = purchaseOrder.commercialTerms.total;
    if (finiteAmount(agreementTotal) && finiteAmount(poTotal) && differs(agreementTotal, poTotal)) {
      checks.push({
        code: "AGREEMENT_PO_TOTAL_MISMATCH",
        severity: "error",
        title: "Agreement and purchase order totals differ",
        detail: `The agreement total is ${agreementTotal.toFixed(2)}, while the purchase order authorizes ${poTotal.toFixed(2)}.`,
        documentIds: [agreement.id, purchaseOrder.id],
        fieldPaths: ["commercialTerms.total"],
        expected: agreementTotal,
        actual: poTotal,
      });
    }

    const agreementDueDate = parseDate(agreement.commercialTerms.dueDate);
    const poDueDate = parseDate(purchaseOrder.commercialTerms.dueDate);
    if (
      agreementDueDate !== null &&
      poDueDate !== null &&
      agreementDueDate !== poDueDate
    ) {
      checks.push({
        code: "AGREEMENT_PO_DUE_DATE_MISMATCH",
        severity: "warning",
        title: "Agreement and purchase order due dates differ",
        detail: "Review which due date should control the engagement before proceeding.",
        documentIds: [agreement.id, purchaseOrder.id],
        fieldPaths: ["commercialTerms.dueDate"],
        expected: agreement.commercialTerms.dueDate ?? "",
        actual: purchaseOrder.commercialTerms.dueDate ?? "",
      });
    }
  }

  const blockingChecks = checks.filter((check) => check.severity === "error");
  const agreementAmount = agreement?.commercialTerms.total ?? null;
  const depositAmount = agreement?.commercialTerms.depositAmount ?? null;
  const currency = normalizedCurrency(
    agreement?.commercialTerms.currency ?? purchaseOrder?.commercialTerms.currency,
  );

  if (blockingChecks.length > 0 || !agreement) {
    return {
      checks,
      readyForPayment: false,
      proposedPayment: {
        action: "REVIEW",
        amount: null,
        currency,
        description: "Resolve document discrepancies before creating a PayPal action.",
      },
    };
  }

  if (fulfillment?.fulfillment.accepted === true) {
    return {
      checks,
      readyForPayment: finiteAmount(agreementAmount) && Boolean(currency),
      proposedPayment: {
        action: "CAPTURE_AUTHORIZATION",
        amount: finiteAmount(agreementAmount) ? agreementAmount : null,
        currency,
        description: "Capture the reviewed authorization after confirmed fulfillment.",
      },
    };
  }

  const paymentTerms = agreement.commercialTerms.paymentTerms?.toLowerCase() ?? "";
  const useAuthorization =
    paymentTerms.includes("acceptance") || paymentTerms.includes("authorize");
  const amount = useAuthorization
    ? agreementAmount
    : finiteAmount(depositAmount)
      ? depositAmount
      : agreementAmount;

  return {
    checks,
    readyForPayment: finiteAmount(amount) && Boolean(currency),
    proposedPayment: {
      action: useAuthorization ? "AUTHORIZE_ORDER" : "CREATE_INVOICE",
      amount: finiteAmount(amount) ? amount : null,
      currency,
      description: useAuthorization
        ? "Authorize the reviewed order; capture remains a separate human-approved action."
        : "Create a reviewed invoice from the extracted commercial terms.",
    },
  };
}
