// ZATCA (Fatoora) e-invoicing.
//
// Phase 1 (generation) — done here for every paid order:
//   sequential invoice number, invoice counter (ICV), UUID, VAT breakdown, QR code with TLV tags 1-5.
// Phase 2 (integration) — prepared here, completed when we are onboarded:
//   UBL 2.1 XML now; the previous-invoice-hash chain (PIH) and hash are added in ICV order by zatca-report
//   (chainInvoice), so parallel orders can never break the chain. The cryptographic stamp (ECDSA),
//   QR tags 6-9 and reporting/clearance are done in zatca-report, either through a ZATCA-certified
//   provider's API or directly with our own CSID from the Fatoora portal. Before going live, validate
//   generated XML with ZATCA's SDK / compliance checks (canonicalisation and hashing rules).
import { type Db, fxPerSar, vatIncluded } from './util.ts';

type Settings = {
  seller_name: string; seller_name_ar: string; vat_number: string; cr_number: string | null; seller_address: string | null;
  vat_rate_bp: number; zero_rate_exports: boolean;
};

export type OrderForInvoice = {
  id: string; number: number; currency: string; total_minor: number; shipping_minor: number;
  ship_to: { country: string; recipient_name: string; city: string; line1: string };
  order_items: { name_en: string; name_ar: string; unit_price_minor: number; quantity: number; line_total_minor: number; vat_rate_bp?: number | null }[];
  /** units of the order's currency per SAR at checkout (null: SAR, or an order from before the marketplace) */
  fx_per_sar?: number | string | null;
};

/** The invoice a credit note corrects: its rate and exchange rate are the credit note's (review M9). */
export type OriginalInvoice = {
  id: string; number: string; currency: string; vat_rate_bp: number | null; fx_per_sar: number | string | null;
  total_incl_vat_minor: number; vat_minor: number; total_sar_incl_vat_minor: number;
};

// ---------------------------------------------------------------- QR (TLV, base64)
function tlv(tag: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 255) throw new Error(`QR field ${tag} too long`);
  return new Uint8Array([tag, bytes.length, ...bytes]);
}

export function zatcaQr(p: { sellerName: string; vatNumber: string; timestamp: string; totalWithVat: string; vatTotal: string }): string {
  const parts = [tlv(1, p.sellerName), tlv(2, p.vatNumber), tlv(3, p.timestamp), tlv(4, p.totalWithVat), tlv(5, p.vatTotal)];
  const all = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of parts) {
    all.set(a, o);
    o += a.length;
  }
  return btoa(String.fromCharCode(...all));
}

const sar = (minor: number) => (minor / 100).toFixed(2);

/** The VAT rate on an invoice, from the rate stored on it or (older invoices) from its own totals. */
export function invoiceRateBp(inv: Pick<OriginalInvoice, 'vat_rate_bp' | 'total_incl_vat_minor' | 'vat_minor'>): number {
  if (typeof inv.vat_rate_bp === 'number') return inv.vat_rate_bp;
  const net = inv.total_incl_vat_minor - inv.vat_minor;
  return net > 0 ? Math.round((inv.vat_minor * 10000) / net / 5) * 5 : 0;
}

/** Units of the invoice's currency per SAR, from the rate stored on it or (older invoices) from its own totals. */
export function invoiceFx(inv: Pick<OriginalInvoice, 'fx_per_sar' | 'total_incl_vat_minor' | 'total_sar_incl_vat_minor' | 'currency'>): number | null {
  if (inv.currency === 'SAR') return 1;
  if (inv.fx_per_sar !== null && inv.fx_per_sar !== undefined && Number(inv.fx_per_sar) > 0) return Number(inv.fx_per_sar);
  return inv.total_sar_incl_vat_minor > 0 ? inv.total_incl_vat_minor / inv.total_sar_incl_vat_minor : null;
}

// ---------------------------------------------------------------- issue an invoice or credit note
/**
 * Builds the document and stores it through mp_issue_document, which takes the invoice counter (ICV) and stores the
 * row in ONE transaction (no gap on any failure) and returns the existing document for an order that already has its
 * invoice or a refund that already has its credit note (review H3, M9, M10). A credit note uses the VAT rate and the
 * exchange rate of the invoice it corrects, never today's settings.
 */
export async function issueInvoice(db: Db, order: OrderForInvoice, opts: {
  doc?: 'invoice' | 'credit_note'; original?: OriginalInvoice | null; refundId?: string; reason?: string;
  /** @deprecated use original */ originalInvoiceId?: string; /** @deprecated use original */ originalNumber?: string;
} = {}) {
  const doc = opts.doc ?? 'invoice';
  const { data: s, error: sErr } = await db.from('store_settings').select('*').eq('id', 1).single();
  if (sErr) throw sErr;
  const settings = s as Settings;

  let rateBp: number;
  let perSar: number;
  if (doc === 'credit_note') {
    if (!opts.original) throw new Error(`Order ${order.number}: a credit note needs the invoice it corrects`);
    rateBp = invoiceRateBp(opts.original);
    perSar = invoiceFx(opts.original) ?? (order.fx_per_sar ? Number(order.fx_per_sar) : await fxPerSar(db, order.currency));
  } else {
    const exportSale = order.ship_to.country !== 'SA';
    rateBp = exportSale && settings.zero_rate_exports ? 0 : settings.vat_rate_bp;
    // Marketplace lines carry the rate the rulebook applied. One invoice has one rate today (every open corridor
    // agrees; checkout refuses anything else); a different rate means a multi-rate invoice is needed, so nothing is
    // issued rather than a wrong one (the order shows on the dashboard as missing its invoice).
    const lineRates = order.order_items.map((l) => l.vat_rate_bp).filter((r): r is number => typeof r === 'number');
    if (lineRates.some((r) => r !== rateBp)) {
      throw new Error(`Order ${order.number}: line VAT ${[...new Set(lineRates)].join('/')} differs from the invoice rate ${rateBp}; a multi-rate invoice is needed`);
    }
    perSar = order.currency === 'SAR' ? 1 : order.fx_per_sar && Number(order.fx_per_sar) > 0 ? Number(order.fx_per_sar) : await fxPerSar(db, order.currency);
  }

  const total = order.total_minor;
  const vat = vatIncluded(total, rateBp);
  const totalSar = Math.round(total / perSar);
  const vatSar = Math.round(vat / perSar);
  const issueAt = new Date();
  const uuid = crypto.randomUUID();
  const qr = zatcaQr({
    sellerName: settings.seller_name,
    vatNumber: settings.vat_number,
    timestamp: issueAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    totalWithVat: sar(totalSar),
    vatTotal: sar(vatSar),
  });
  const originalNumber = opts.original?.number ?? opts.originalNumber;
  // the number and the counter go in when the counter is taken (mp_issue_document)
  const xml = buildUblXml({ settings, order, number: '{{NUMBER}}', uuid, icv: '{{ICV}}', issueAt, doc, rateBp, total, vat, totalSar, vatSar, qr, reason: opts.reason, originalNumber });

  const { data, error } = await db.rpc('mp_issue_document', {
    p: {
      doc, order_id: order.id, refund_id: opts.refundId ?? null, original_invoice_id: opts.original?.id ?? opts.originalInvoiceId ?? null,
      reason: opts.reason ?? null, uuid, issue_at: issueAt.toISOString(), currency: order.currency,
      total_excl_vat_minor: total - vat, vat_minor: vat, total_incl_vat_minor: total, total_sar_incl_vat_minor: totalSar, vat_sar_minor: vatSar,
      vat_rate_bp: rateBp, fx_per_sar: perSar, buyer: { name: order.ship_to.recipient_name, country: order.ship_to.country }, qr_base64: qr, xml,
    },
  });
  if (error) throw error;
  return data as { id: string; number: string; duplicate: boolean };
}

type InvoiceContext = {
  order: { id: string; number: number; currency: string; status: string; ship_to: OrderForInvoice['ship_to']; fx_per_sar: number | null };
  invoice: { id: string; number: string } | null;
  items: OrderForInvoice['order_items'];
  shipping_minor: number;
  seller_invoiced: number;
};

/**
 * The order's tax invoice for what WE sell (our own products and the parcels where the platform is the supplier, with
 * their delivery; never duties, which are collected for customs): issued once, whoever asks first (the payment
 * webhook, a retry of it, or finish-pending). Null when the order has nothing we invoice.
 */
export async function ensureInvoice(db: Db, orderId: string): Promise<{ id: string; number: string; duplicate: boolean } | null> {
  const { data, error } = await db.rpc('mp_invoice_context', { p_order: orderId });
  if (error) throw error;
  const c = data as InvoiceContext | null;
  if (!c) throw new Error('Order not found');
  if (c.invoice) return { ...c.invoice, duplicate: true };
  if (!c.items.length) return null;
  const total = c.items.reduce((n, i) => n + i.line_total_minor, 0) + c.shipping_minor;
  return issueInvoice(db, { ...c.order, order_items: c.items, shipping_minor: c.shipping_minor, total_minor: total });
}

type CreditNoteContext = {
  refund: {
    id: string; status: string; reason: string; platform_minor: number; credit_note_status: string; credit_note: string | null;
    order: { id: string; number: number; currency: string; ship_to: OrderForInvoice['ship_to'] };
    lines: { kind: 'item' | 'shipping' | 'duties'; quantity: number | null; amount_minor: number; vat_rate_bp: number | null; platform_invoiced: boolean;
             name_en: string | null; name_ar: string | null; unit_price_minor: number | null }[];
  };
  original: OriginalInvoice | null;
  order_fx_per_sar: number | null;
};

/** The ZATCA credit note for the part of a refund we invoiced (never duties), against the order's invoice. */
export async function issueCreditNote(db: Db, refundId: string): Promise<{ id: string; number: string; duplicate: boolean } | null> {
  const { data, error } = await db.rpc('mp_credit_note_context', { p_refund: refundId });
  if (error) throw error;
  const c = data as CreditNoteContext | null;
  if (!c) throw new Error('Refund not found');
  const f = c.refund;
  if (f.credit_note_status === 'issued') return { id: '', number: f.credit_note ?? '', duplicate: true };
  if (f.status !== 'succeeded' || f.credit_note_status !== 'pending' || f.platform_minor <= 0) return null;
  if (!c.original) throw new Error(`Order ${f.order.number} has no tax invoice yet: issue it first`);
  const ours = f.lines.filter((l) => l.platform_invoiced);
  const forNote: OrderForInvoice = {
    id: f.order.id, number: f.order.number, currency: f.order.currency, ship_to: f.order.ship_to, total_minor: f.platform_minor,
    shipping_minor: ours.filter((l) => l.kind === 'shipping').reduce((n, l) => n + l.amount_minor, 0),
    order_items: ours.filter((l) => l.kind === 'item').map((l) => ({
      name_en: l.name_en ?? 'Item', name_ar: l.name_ar ?? 'منتج', unit_price_minor: l.unit_price_minor ?? l.amount_minor,
      quantity: l.quantity ?? 1, line_total_minor: l.amount_minor, vat_rate_bp: l.vat_rate_bp,
    })),
    fx_per_sar: c.order_fx_per_sar,
  };
  return issueInvoice(db, forNote, { doc: 'credit_note', original: c.original, refundId: f.id, reason: f.reason || 'Refund' });
}

/** Phase 2: add the previous-invoice hash to a stored invoice XML, then hash it. Called in ICV order by zatca-report. */
export async function chainInvoice(xml: string, pih: string): Promise<{ xml: string; hash: string }> {
  const ref = `<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${pih}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
  const out = xml.replace('<!--PIH-->', ref);
  // ZATCA hashes the canonicalised XML without UBLExtensions, the QR reference and the signature.
  // Validate this step with ZATCA's SDK before using direct mode.
  return { xml: out, hash: await sha256Base64(out) };
}

export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------- UBL 2.1 XML (simplified tax invoice / credit note)
function buildUblXml(p: {
  settings: Settings; order: OrderForInvoice; number: string; uuid: string; icv: number | string; issueAt: Date;
  doc: 'invoice' | 'credit_note'; rateBp: number; total: number; vat: number; totalSar: number; vatSar: number; qr: string; reason?: string; originalNumber?: string;
}): string {
  const cur = p.order.currency;
  const date = p.issueAt.toISOString().slice(0, 10);
  const time = p.issueAt.toISOString().slice(11, 19);
  const typeCode = p.doc === 'credit_note' ? '381' : '388';
  const rate = (p.rateBp / 100).toFixed(2);
  const category = p.rateBp === 0 ? 'Z' : 'S';
  const amt = (m: number) => (m / 100).toFixed(2);

  const lines = p.order.order_items.map((l, i) => {
    const lineVat = vatIncluded(l.line_total_minor, p.rateBp);
    const lineNet = l.line_total_minor - lineVat;
    return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${l.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${amt(lineNet)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${cur}">${amt(lineVat)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="${cur}">${amt(l.line_total_minor)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(l.name_ar)} / ${esc(l.name_en)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${cur}">${amt(l.unit_price_minor - vatIncluded(l.unit_price_minor, p.rateBp))}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
  }).join('');

  const shippingVat = vatIncluded(p.order.shipping_minor, p.rateBp);
  const net = p.total - p.vat;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${p.number}</cbc:ID>
  <cbc:UUID>${p.uuid}</cbc:UUID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:IssueTime>${time}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>${p.doc === 'credit_note' ? `
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(p.originalNumber ?? '')}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ''}
  <cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${p.icv}</cbc:UUID></cac:AdditionalDocumentReference>
  <!--PIH-->
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(p.settings.cr_number ?? '')}</cbc:ID></cac:PartyIdentification>
    <cac:PostalAddress><cbc:StreetName>${esc(p.settings.seller_address ?? '')}</cbc:StreetName><cbc:CityName>Madinah</cbc:CityName><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${p.settings.vat_number}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.settings.seller_name_ar)} / ${esc(p.settings.seller_name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PostalAddress><cbc:StreetName>${esc(p.order.ship_to.line1)}</cbc:StreetName><cbc:CityName>${esc(p.order.ship_to.city)}</cbc:CityName><cac:Country><cbc:IdentificationCode>${p.order.ship_to.country}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.order.ship_to.recipient_name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:Delivery><cbc:ActualDeliveryDate>${date}</cbc:ActualDeliveryDate></cac:Delivery>
  <cac:PaymentMeans><cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>${p.doc === 'credit_note' ? `<cbc:InstructionNote>${esc(p.reason ?? 'Refund')}</cbc:InstructionNote>` : ''}</cac:PaymentMeans>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Delivery</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${cur}">${amt(p.order.shipping_minor - shippingVat)}</cbc:Amount>
    <cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:AllowanceCharge>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${amt(p.vatSar)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${amt(p.vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${amt(net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${amt(p.vat)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent>${category === 'Z' ? '<cbc:TaxExemptionReasonCode>VATEX-SA-32</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Export of goods</cbc:TaxExemptionReason>' : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${amt(net - (p.order.shipping_minor - shippingVat))}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${amt(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${amt(p.total)}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="${cur}">${amt(p.order.shipping_minor - shippingVat)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="${cur}">${amt(p.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
}
