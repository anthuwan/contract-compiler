export type PayPalEnvironment = "sandbox" | "live";

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalAuthorization {
  id: string;
  status: string;
  amount?: PayPalMoney;
  links?: PayPalLink[];
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: PayPalMoney;
  final_capture?: boolean;
  links?: PayPalLink[];
}

export interface PayPalOrder {
  id: string;
  intent: "AUTHORIZE" | "CAPTURE";
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    description?: string;
    amount?: PayPalMoney;
    payments?: {
      authorizations?: PayPalAuthorization[];
      captures?: PayPalCapture[];
    };
  }>;
  payer?: {
    email_address?: string;
    payer_id?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  links?: PayPalLink[];
}

export interface CreateAuthorizeOrderInput {
  amount: {
    currencyCode: string;
    value: string;
  };
  description?: string;
  referenceId?: string;
  customId?: string;
  invoiceId?: string;
}

export interface CaptureAuthorizationInput {
  amount?: {
    currencyCode: string;
    value: string;
  };
  finalCapture?: boolean;
  invoiceId?: string;
  noteToPayer?: string;
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  create_time?: string;
  resource_type?: string;
  summary?: string;
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PayPalWebhookRecord {
  id: string;
  eventType: string;
  receivedAt: string;
  resourceId?: string;
  resourceStatus?: string;
  summary?: string;
}
