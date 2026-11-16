/** Idioma de la factura según el país del cliente (español por defecto) */
export type Idioma = 'es' | 'en' | 'it' | 'fr' | 'de' | 'pt'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const PAISES: [Idioma, string[]][] = [
  ['es', ['espana', 'spain', 'es', 'esp', 'mexico', 'argentina', 'colombia', 'chile', 'peru', 'uruguay', 'venezuela', 'ecuador', 'bolivia', 'paraguay', 'costarica', 'panama', 'guatemala', 'honduras', 'elsalvador', 'nicaragua', 'cuba', 'republicadominicana', 'puertorico', 'andorra']],
  ['it', ['italia', 'italy', 'it', 'ita', 'sanmarino', 'vaticano']],
  ['fr', ['francia', 'france', 'fr', 'fra', 'belgica', 'belgique', 'belgium', 'luxemburgo', 'luxembourg', 'monaco', 'suiza', 'suisse']],
  ['de', ['alemania', 'germany', 'deutschland', 'de', 'deu', 'austria', 'osterreich', 'schweiz', 'liechtenstein']],
  ['pt', ['portugal', 'pt', 'prt', 'brasil', 'brazil']],
]

export function idiomaDePais(pais: string | null | undefined): Idioma {
  if (!pais?.trim()) return 'es'
  const p = norm(pais)
  for (const [idioma, lista] of PAISES) if (lista.includes(p)) return idioma
  return 'en' // cualquier otro país: inglés
}

type Textos = {
  factura: string
  rectificativa: string
  presupuesto: string
  numero: string
  fecha: string
  vencimiento: string
  validoHasta: string
  borrador: string
  de: string
  facturarA: string
  para: string
  nif: string
  concepto: string
  cant: string
  precio: string
  impuesto: string
  importe: string
  base: string
  sobreBase: string
  retencion: string
  total: string
  bloqueRectificativa: string
  rectifica: (num: string, fecha: string | null) => string
  causa: string
  motivo: string
  notas: string
  formaPago: string
  transferencia: (iban: string) => string
  transferenciaCorta: string
  refPago: (numero: string) => string
  pagina: (p: number, n: number) => string
  marcaPruebas: string
  avisoPruebas: string
  /** Marca de NomoTax al pie del PDF */
  hechoCon: string
  archivoFactura: string
  archivoPresupuesto: string
}

export const TEXTOS: Record<Idioma, Textos> = {
  es: {
    factura: 'FACTURA', rectificativa: 'FACTURA RECTIFICATIVA', presupuesto: 'PRESUPUESTO',
    numero: 'Número', fecha: 'Fecha', vencimiento: 'Vencimiento', validoHasta: 'Válido hasta', borrador: 'Borrador',
    de: 'De', facturarA: 'Facturar a', para: 'Para', nif: 'NIF',
    concepto: 'Concepto', cant: 'Cant.', precio: 'Precio', impuesto: 'IVA', importe: 'Importe',
    base: 'Base imponible', sobreBase: 'base', retencion: 'Retención IRPF', total: 'TOTAL',
    bloqueRectificativa: 'Factura rectificativa',
    rectifica: (n, f) => `Rectifica la factura nº ${n}${f ? ` de fecha ${f}` : ''}.`, causa: 'Causa', motivo: 'Motivo',
    notas: 'Notas', formaPago: 'Forma de pago', transferencia: (i) => `Transferencia bancaria a ${i}`,
    transferenciaCorta: 'Transferencia', refPago: (n) => `Indica ${n} en el concepto de la transferencia.`,
    pagina: (p, n) => `Página ${p} de ${n}`,
    marcaPruebas: 'DOCUMENTO DE PRUEBAS', avisoPruebas: 'Documento generado en modo pruebas: no válido como factura.', hechoCon: 'Creado con NomoTax · nomotax.io',
    archivoFactura: 'Factura', archivoPresupuesto: 'Presupuesto',
  },
  en: {
    factura: 'INVOICE', rectificativa: 'CORRECTIVE INVOICE', presupuesto: 'QUOTE',
    numero: 'Number', fecha: 'Date', vencimiento: 'Due date', validoHasta: 'Valid until', borrador: 'Draft',
    de: 'From', facturarA: 'Bill to', para: 'To', nif: 'Tax ID',
    concepto: 'Description', cant: 'Qty', precio: 'Price', impuesto: 'VAT', importe: 'Amount',
    base: 'Subtotal', sobreBase: 'on', retencion: 'Withholding tax (IRPF)', total: 'TOTAL',
    bloqueRectificativa: 'Corrective invoice',
    rectifica: (n, f) => `Corrects invoice no. ${n}${f ? ` dated ${f}` : ''}.`, causa: 'Reason', motivo: 'Details',
    notas: 'Notes', formaPago: 'Payment', transferencia: (i) => `Bank transfer to ${i}`,
    transferenciaCorta: 'Bank transfer', refPago: (n) => `Please quote ${n} as the payment reference.`,
    pagina: (p, n) => `Page ${p} of ${n}`,
    marcaPruebas: 'TEST DOCUMENT', avisoPruebas: 'Generated in test mode: not valid as an invoice.', hechoCon: 'Made with NomoTax · nomotax.io',
    archivoFactura: 'Invoice', archivoPresupuesto: 'Quote',
  },
  it: {
    factura: 'FATTURA', rectificativa: 'NOTA DI CREDITO', presupuesto: 'PREVENTIVO',
    numero: 'Numero', fecha: 'Data', vencimiento: 'Scadenza', validoHasta: 'Valido fino al', borrador: 'Bozza',
    de: 'Da', facturarA: 'Fatturare a', para: 'Per', nif: 'P. IVA / C.F.',
    concepto: 'Descrizione', cant: 'Q.tà', precio: 'Prezzo', impuesto: 'IVA', importe: 'Importo',
    base: 'Imponibile', sobreBase: 'su', retencion: 'Ritenuta (IRPF)', total: 'TOTALE',
    bloqueRectificativa: 'Fattura rettificativa',
    rectifica: (n, f) => `Rettifica la fattura n. ${n}${f ? ` del ${f}` : ''}.`, causa: 'Causa', motivo: 'Motivo',
    notas: 'Note', formaPago: 'Pagamento', transferencia: (i) => `Bonifico bancario a ${i}`,
    transferenciaCorta: 'Bonifico bancario', refPago: (n) => `Indicare ${n} nella causale del bonifico.`,
    pagina: (p, n) => `Pagina ${p} di ${n}`,
    marcaPruebas: 'DOCUMENTO DI PROVA', avisoPruebas: 'Generato in modalità di prova: non valido come fattura.', hechoCon: 'Creato con NomoTax · nomotax.io',
    archivoFactura: 'Fattura', archivoPresupuesto: 'Preventivo',
  },
  fr: {
    factura: 'FACTURE', rectificativa: 'FACTURE RECTIFICATIVE', presupuesto: 'DEVIS',
    numero: 'Numéro', fecha: 'Date', vencimiento: 'Échéance', validoHasta: "Valable jusqu'au", borrador: 'Brouillon',
    de: 'De', facturarA: 'Facturer à', para: 'Pour', nif: 'N° TVA',
    concepto: 'Désignation', cant: 'Qté', precio: 'Prix', impuesto: 'TVA', importe: 'Montant',
    base: 'Total HT', sobreBase: 'sur', retencion: 'Retenue (IRPF)', total: 'TOTAL TTC',
    bloqueRectificativa: 'Facture rectificative',
    rectifica: (n, f) => `Rectifie la facture n° ${n}${f ? ` du ${f}` : ''}.`, causa: 'Motif', motivo: 'Détail',
    notas: 'Notes', formaPago: 'Paiement', transferencia: (i) => `Virement bancaire sur ${i}`,
    transferenciaCorta: 'Virement bancaire', refPago: (n) => `Merci d’indiquer ${n} en référence du virement.`,
    pagina: (p, n) => `Page ${p} sur ${n}`,
    marcaPruebas: 'DOCUMENT DE TEST', avisoPruebas: 'Généré en mode test : non valable comme facture.', hechoCon: 'Créé avec NomoTax · nomotax.io',
    archivoFactura: 'Facture', archivoPresupuesto: 'Devis',
  },
  de: {
    factura: 'RECHNUNG', rectificativa: 'KORREKTURRECHNUNG', presupuesto: 'ANGEBOT',
    numero: 'Nummer', fecha: 'Datum', vencimiento: 'Fällig am', validoHasta: 'Gültig bis', borrador: 'Entwurf',
    de: 'Von', facturarA: 'Rechnung an', para: 'An', nif: 'USt-IdNr.',
    concepto: 'Beschreibung', cant: 'Menge', precio: 'Preis', impuesto: 'MwSt.', importe: 'Betrag',
    base: 'Nettobetrag', sobreBase: 'auf', retencion: 'Quellensteuer (IRPF)', total: 'GESAMT',
    bloqueRectificativa: 'Korrekturrechnung',
    rectifica: (n, f) => `Korrigiert Rechnung Nr. ${n}${f ? ` vom ${f}` : ''}.`, causa: 'Grund', motivo: 'Details',
    notas: 'Hinweise', formaPago: 'Zahlung', transferencia: (i) => `Banküberweisung an ${i}`,
    transferenciaCorta: 'Banküberweisung', refPago: (n) => `Bitte geben Sie ${n} als Verwendungszweck an.`,
    pagina: (p, n) => `Seite ${p} von ${n}`,
    marcaPruebas: 'TESTDOKUMENT', avisoPruebas: 'Im Testmodus erstellt: keine gültige Rechnung.', hechoCon: 'Erstellt mit NomoTax · nomotax.io',
    archivoFactura: 'Rechnung', archivoPresupuesto: 'Angebot',
  },
  pt: {
    factura: 'FATURA', rectificativa: 'FATURA RETIFICATIVA', presupuesto: 'ORÇAMENTO',
    numero: 'Número', fecha: 'Data', vencimiento: 'Vencimento', validoHasta: 'Válido até', borrador: 'Rascunho',
    de: 'De', facturarA: 'Faturar a', para: 'Para', nif: 'NIF',
    concepto: 'Descrição', cant: 'Qtd.', precio: 'Preço', impuesto: 'IVA', importe: 'Valor',
    base: 'Base tributável', sobreBase: 'sobre', retencion: 'Retenção (IRPF)', total: 'TOTAL',
    bloqueRectificativa: 'Fatura retificativa',
    rectifica: (n, f) => `Retifica a fatura n.º ${n}${f ? ` de ${f}` : ''}.`, causa: 'Causa', motivo: 'Motivo',
    notas: 'Notas', formaPago: 'Pagamento', transferencia: (i) => `Transferência bancária para ${i}`,
    transferenciaCorta: 'Transferência bancária', refPago: (n) => `Indique ${n} na referência da transferência.`,
    pagina: (p, n) => `Página ${p} de ${n}`,
    marcaPruebas: 'DOCUMENTO DE TESTE', avisoPruebas: 'Gerado em modo de teste: não válido como fatura.', hechoCon: 'Criado com NomoTax · nomotax.io',
    archivoFactura: 'Fatura', archivoPresupuesto: 'Orcamento',
  },
}

export const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'español', en: 'inglés', it: 'italiano', fr: 'francés', de: 'alemán', pt: 'portugués' }
