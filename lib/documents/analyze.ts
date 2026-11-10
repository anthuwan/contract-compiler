import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";

import {
  type AnalyzedDocument,
  DocumentAnalysisSchema,
} from "@/lib/documents/schema";
import {
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  DOCUMENT_ANALYSIS_USER_PROMPT,
} from "@/lib/documents/prompt";

export class DocumentAnalysisError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocumentAnalysisError";
  }
}

function safeFileName(name: string, index: number) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || `uploaded-document-${index + 1}.pdf`;
}

function extractJsonObject(text: string): unknown {
  const withoutFences = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new DocumentAnalysisError(
      "The model did not return a JSON object.",
      "MODEL_OUTPUT_NOT_JSON",
      502,
    );
  }

  try {
    return JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new DocumentAnalysisError(
      "The model returned malformed JSON.",
      "MODEL_OUTPUT_INVALID_JSON",
      502,
    );
  }
}

function responseText(response: ConverseCommandOutput) {
  const content = response.output?.message?.content ?? [];
  return content
    .map((block) => ("text" in block ? block.text ?? "" : ""))
    .filter(Boolean)
    .join("\n");
}

export async function analyzePdfWithBedrock(
  file: File,
  index: number,
): Promise<AnalyzedDocument> {
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-1";

  if (!modelId) {
    throw new DocumentAnalysisError(
      "BEDROCK_MODEL_ID is required when DOCUMENT_ANALYSIS_MODE is not demo.",
      "BEDROCK_NOT_CONFIGURED",
      503,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const client = new BedrockRuntimeClient({ region });
  let response;

  try {
    response = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: DOCUMENT_ANALYSIS_SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              { text: DOCUMENT_ANALYSIS_USER_PROMPT },
              {
                document: {
                  format: "pdf",
                  name: `document-${index + 1}`,
                  source: { bytes },
                },
              },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 3_500,
          temperature: 0,
        },
      }),
    );
  } catch {
    throw new DocumentAnalysisError(
      "Bedrock could not analyze the document.",
      "BEDROCK_REQUEST_FAILED",
      502,
    );
  }

  const rawText = responseText(response);
  const candidate = extractJsonObject(rawText);
  const parsed = DocumentAnalysisSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new DocumentAnalysisError(
      "The model output did not match the required extraction schema.",
      "MODEL_OUTPUT_SCHEMA_MISMATCH",
      502,
    );
  }

  return {
    ...parsed.data,
    id: crypto.randomUUID(),
    fileName: safeFileName(file.name, index),
  };
}
