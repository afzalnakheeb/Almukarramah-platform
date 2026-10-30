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

// ---------------------------------------------------------------- issue an invoice or credit note
export async function issueInvoice(db: Db, order: OrderForInvoice, opts: { doc?: 'invoice' | 'credit_note'; originalInvoiceId?: string; originalNumber?: string; reason?: string } = {}) {
  const doc = opts.doc ?? 'invoice';
  const { data: s } = await db.from('store_settings').select('*').eq('id', 1).single();
  const settings = s as Settings;

  const exportSale = order.ship_to.country !== 'SA';
  const rateBp = exportSale && settings.zero_rate_exports ? 0 : settings.vat_rate_bp;
  // Marketplace lines carry the rate the rulebook applied. One invoice has one rate today (every open corridor
  // agrees); a different rate means a multi-rate invoice is needed, so nothing is issued rather than a wrong one.
  const lineRates = order.order_items.map((l) => l.vat_rate_bp).filter((r): r is number => typeof r === 'number');
  if (lineRates.some((r) => r !== rateBp)) {
    throw new Error(`Order ${order.number}: line VAT ${[...new Set(lineRates)].join('/')} differs from the invoice rate ${rateBp}; a multi-rate invoice is needed`);
  }

  const total = order.total_minor;
  const vat = vatIncluded(total, rateBp);
  const perSar = await fxPerSar(db, order.currency);
  const totalSar = Math.round(total / perSar);
  const vatSar = Math.round(vat / perSar);

  const { data: slot, error } = await db.rpc('next_invoice_slot');
  if (error) throw error;
  const icv = Number(slot);

  const issueAt = new Date();
  const year = issueAt.getUTCFullYear();
  const prefix = doc === 'credit_note' ? 'CN' : 'INV';
  const number = `${prefix}-${year}-${String(icv).padStart(6, '0')}`;
  const uuid = crypto.randomUUID();

  const qr = zatcaQr({
    sellerName: settings.seller_name,
    vatNumber: settings.vat_number,
    timestamp: issueAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    totalWithVat: sar(totalSar),
    vatTotal: sar(vatSar),
  });

  const xml = buildUblXml({ settings, order, number, uuid, icv, issueAt, doc, rateBp, total, vat, totalSar, vatSar, qr, reason: opts.reason, originalNumber: opts.originalNumber });

  const { data: inv, error: insErr } = await db.from('invoices').insert({
    uuid, number, icv, kind: 'simplified', doc,
    order_id: order.id, original_invoice_id: opts.originalInvoiceId ?? null, reason: opts.reason ?? null,
    issue_at: issueAt.toISOString(), currency: order.currency,
    total_excl_vat_minor: total - vat, vat_minor: vat, total_incl_vat_minor: total,
    total_sar_incl_vat_minor: totalSar, vat_sar_minor: vatSar,
    buyer: { name: order.ship_to.recipient_name, country: order.ship_to.country },
    qr_base64: qr, xml,
  }).select('id, number').single();
  if (insErr) throw insErr;
  return inv as { id: string; number: string };
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
  settings: Settings; order: OrderForInvoice; number: string; uuid: string; icv: number; issueAt: Date;
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
