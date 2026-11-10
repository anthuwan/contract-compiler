import { analyzePdfWithBedrock, DocumentAnalysisError } from "@/lib/documents/analyze";
import { createDemoDocuments } from "@/lib/documents/demo";
import { reconcileDocuments } from "@/lib/documents/reconcile";

export const dynamic = "force-dynamic";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

type AnalysisMode = "bedrock" | "demo";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function selectedMode(): AnalysisMode {
  const value = (process.env.DOCUMENT_ANALYSIS_MODE || "bedrock").toLowerCase();
  if (value === "bedrock" || value === "demo") return value;
  throw new DocumentAnalysisError(
    "DOCUMENT_ANALYSIS_MODE must be either bedrock or demo.",
    "INVALID_ANALYSIS_MODE",
    503,
  );
}

async function assertPdf(file: File) {
  const magicBytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const magic = String.fromCharCode(...magicBytes);
  const looksLikePdf = magic === "%PDF-";
  if (!looksLikePdf) {
    throw new DocumentAnalysisError(
      `${file.name || "Uploaded file"} is not a valid PDF.`,
      "INVALID_PDF",
      415,
    );
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json(
      {
        error: {
          code: "MULTIPART_REQUIRED",
          message: "Upload PDF documents using multipart/form-data.",
          requestId,
        },
      },
      415,
    );
  }

  if (Number.isFinite(contentLength) && contentLength > MAX_TOTAL_BYTES + 64 * 1024) {
    return json(
      {
        error: {
          code: "UPLOAD_TOO_LARGE",
          message: "The combined upload exceeds the 10 MB limit.",
          requestId,
        },
      },
      413,
    );
  }

  try {
    const mode = selectedMode();
    const formData = await request.formData();
    const files = Array.from(formData.values()).filter(
      (value): value is File => typeof value !== "string",
    );

    if (files.length > MAX_FILES) {
      throw new DocumentAnalysisError(
        `Upload at most ${MAX_FILES} PDF documents.`,
        "TOO_MANY_FILES",
        413,
      );
    }

    if (mode === "bedrock" && files.length === 0) {
      throw new DocumentAnalysisError(
        "Upload at least one PDF document.",
        "FILES_REQUIRED",
        400,
      );
    }

    let totalBytes = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new DocumentAnalysisError(
          `${file.name || "A document"} exceeds the 4 MB limit.`,
          "FILE_TOO_LARGE",
          413,
        );
      }
      totalBytes += file.size;
      await assertPdf(file);
    }

    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new DocumentAnalysisError(
        "The combined upload exceeds the 10 MB limit.",
        "UPLOAD_TOO_LARGE",
        413,
      );
    }

    const documents =
      mode === "demo"
        ? createDemoDocuments(files)
        : await Promise.all(files.map(analyzePdfWithBedrock));
    const reconciliation = reconcileDocuments(documents);

    return json({
      mode,
      documents,
      reconciliation,
      meta: {
        requestId,
        processedAt: new Date().toISOString(),
        documentsProcessed: documents.length,
        demoScenario: mode === "demo" ? "agency-sow-po-mismatch" : null,
      },
    });
  } catch (error) {
    if (error instanceof DocumentAnalysisError) {
      return json(
        {
          error: {
            code: error.code,
            message: error.message,
            requestId,
          },
        },
        error.status,
      );
    }

    return json(
      {
        error: {
          code: "DOCUMENT_ANALYSIS_FAILED",
          message: "The documents could not be analyzed.",
          requestId,
        },
      },
      500,
    );
  }
}
