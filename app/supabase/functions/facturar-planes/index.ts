// GENERADO con `node scripts/empaquetar-facturar.mjs` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → facturar-planes. No lo edites a mano.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";
import { GState, jsPDF } from "npm:jspdf@^4.2.1";
import autoTable from "npm:jspdf-autotable@^5.0.9";
// src/lib/format.ts
/**
* Formato español de Pablo: punto de miles siempre (también en 4 cifras: 1.234),
* coma decimal y el € pegado al número: 1.234,56€
*/
function agrupar(n, decimales, fijos) {
	const v = Number.isFinite(n) ? n : 0;
	let [ent, frac = ""] = Math.abs(v).toFixed(decimales).split(".");
	if (!fijos) frac = frac.replace(/0+$/, "");
	ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return `${v < 0 && Number(Math.abs(v).toFixed(decimales)) !== 0 ? "-" : ""}${ent}${frac ? `,${frac}` : ""}`;
}
const eur$1 = (n) => `${agrupar(Number(n ?? 0), 2, true)}€`;
const num = (n, decimales = 2) => agrupar(Number(n ?? 0), decimales, false);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/** 2026-11-12 → 12/11/2026 */
function fecha(iso) {
	if (!iso) return "—";
	const [y, m, d] = iso.slice(0, 10).split("-");
	return `${d}/${m}/${y}`;
}
function direccionCompleta(d) {
	const linea2 = [d.cp, d.ciudad].filter(Boolean).join(" ");
	const linea3 = [d.provincia, d.pais && d.pais !== "España" ? d.pais : null].filter(Boolean).join(", ");
	return [
		d.direccion,
		linea2,
		linea3
	].filter((x) => Boolean(x && x.trim()));
}
// src/lib/totals.ts
function importeLinea(l) {
	const bruto = Number(l.cantidad || 0) * Number(l.precio || 0);
	return round2(bruto * (1 - Number(l.descuento || 0) / 100));
}
function calcularTotales(lineas, irpfPct) {
	const porTipo = /* @__PURE__ */ new Map();
	for (const l of lineas) {
		const tipo = Number(l.iva || 0);
		porTipo.set(tipo, round2((porTipo.get(tipo) ?? 0) + importeLinea(l)));
	}
	const desglose = [...porTipo.entries()].sort((a, b) => b[0] - a[0]).map(([tipo, base]) => ({
		tipo,
		base,
		cuota: round2(base * tipo / 100)
	}));
	const base = round2(desglose.reduce((s, d) => s + d.base, 0));
	const cuota_iva = round2(desglose.reduce((s, d) => s + d.cuota, 0));
	const cuota_irpf = round2(base * Number(irpfPct || 0) / 100);
	return {
		base,
		cuota_iva,
		cuota_irpf,
		total: round2(base + cuota_iva - cuota_irpf),
		desglose
	};
}
// src/lib/estados.ts
/** Causas de rectificación (códigos de Verifactu / SII) */
const CAUSAS_RECTIFICACION = [
	{
		id: "R1",
		nombre: "Error fundado en derecho, devolución, descuento o anulación (art. 80 Uno, Dos y Seis LIVA)"
	},
	{
		id: "R2",
		nombre: "Concurso de acreedores del cliente (art. 80 Tres LIVA)"
	},
	{
		id: "R3",
		nombre: "Crédito incobrable (art. 80 Cuatro LIVA)"
	},
	{
		id: "R4",
		nombre: "Otras causas (p. ej. errores en los datos de la factura)"
	}
];
// src/lib/idiomaFactura.ts
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const PAISES = [
	["es", [
		"espana",
		"spain",
		"es",
		"esp",
		"mexico",
		"argentina",
		"colombia",
		"chile",
		"peru",
		"uruguay",
		"venezuela",
		"ecuador",
		"bolivia",
		"paraguay",
		"costarica",
		"panama",
		"guatemala",
		"honduras",
		"elsalvador",
		"nicaragua",
		"cuba",
		"republicadominicana",
		"puertorico",
		"andorra"
	]],
	["it", [
		"italia",
		"italy",
		"it",
		"ita",
		"sanmarino",
		"vaticano"
	]],
	["fr", [
		"francia",
		"france",
		"fr",
		"fra",
		"belgica",
		"belgique",
		"belgium",
		"luxemburgo",
		"luxembourg",
		"monaco",
		"suiza",
		"suisse"
	]],
	["de", [
		"alemania",
		"germany",
		"deutschland",
		"de",
		"deu",
		"austria",
		"osterreich",
		"schweiz",
		"liechtenstein"
	]],
	["pt", [
		"portugal",
		"pt",
		"prt",
		"brasil",
		"brazil"
	]]
];
function idiomaDePais(pais) {
	if (!pais?.trim()) return "es";
	const p = norm(pais);
	for (const [idioma, lista] of PAISES) if (lista.includes(p)) return idioma;
	return "en";
}
const TEXTOS = {
	es: {
		factura: "FACTURA",
		rectificativa: "FACTURA RECTIFICATIVA",
		presupuesto: "PRESUPUESTO",
		numero: "Número",
		fecha: "Fecha",
		vencimiento: "Vencimiento",
		validoHasta: "Válido hasta",
		borrador: "Borrador",
		de: "De",
		facturarA: "Facturar a",
		para: "Para",
		nif: "NIF",
		concepto: "Concepto",
		cant: "Cant.",
		precio: "Precio",
		impuesto: "IVA",
		importe: "Importe",
		base: "Base imponible",
		sobreBase: "base",
		retencion: "Retención IRPF",
		total: "TOTAL",
		bloqueRectificativa: "Factura rectificativa",
		rectifica: (n, f) => `Rectifica la factura nº ${n}${f ? ` de fecha ${f}` : ""}.`,
		causa: "Causa",
		motivo: "Motivo",
		notas: "Notas",
		formaPago: "Forma de pago",
		transferencia: (i) => `Transferencia bancaria a ${i}`,
		transferenciaCorta: "Transferencia",
		refPago: (n) => `Indica ${n} en el concepto de la transferencia.`,
		pagina: (p, n) => `Página ${p} de ${n}`,
		marcaPruebas: "DOCUMENTO DE PRUEBAS",
		avisoPruebas: "Documento generado en modo pruebas: no válido como factura.",
		hechoCon: "Creado con NomoTax · nomotax.io",
		archivoFactura: "Factura",
		archivoPresupuesto: "Presupuesto"
	},
	en: {
		factura: "INVOICE",
		rectificativa: "CORRECTIVE INVOICE",
		presupuesto: "QUOTE",
		numero: "Number",
		fecha: "Date",
		vencimiento: "Due date",
		validoHasta: "Valid until",
		borrador: "Draft",
		de: "From",
		facturarA: "Bill to",
		para: "To",
		nif: "Tax ID",
		concepto: "Description",
		cant: "Qty",
		precio: "Price",
		impuesto: "VAT",
		importe: "Amount",
		base: "Subtotal",
		sobreBase: "on",
		retencion: "Withholding tax (IRPF)",
		total: "TOTAL",
		bloqueRectificativa: "Corrective invoice",
		rectifica: (n, f) => `Corrects invoice no. ${n}${f ? ` dated ${f}` : ""}.`,
		causa: "Reason",
		motivo: "Details",
		notas: "Notes",
		formaPago: "Payment",
		transferencia: (i) => `Bank transfer to ${i}`,
		transferenciaCorta: "Bank transfer",
		refPago: (n) => `Please quote ${n} as the payment reference.`,
		pagina: (p, n) => `Page ${p} of ${n}`,
		marcaPruebas: "TEST DOCUMENT",
		avisoPruebas: "Generated in test mode: not valid as an invoice.",
		hechoCon: "Made with NomoTax · nomotax.io",
		archivoFactura: "Invoice",
		archivoPresupuesto: "Quote"
	},
	it: {
		factura: "FATTURA",
		rectificativa: "NOTA DI CREDITO",
		presupuesto: "PREVENTIVO",
		numero: "Numero",
		fecha: "Data",
		vencimiento: "Scadenza",
		validoHasta: "Valido fino al",
		borrador: "Bozza",
		de: "Da",
		facturarA: "Fatturare a",
		para: "Per",
		nif: "P. IVA / C.F.",
		concepto: "Descrizione",
		cant: "Q.tà",
		precio: "Prezzo",
		impuesto: "IVA",
		importe: "Importo",
		base: "Imponibile",
		sobreBase: "su",
		retencion: "Ritenuta (IRPF)",
		total: "TOTALE",
		bloqueRectificativa: "Fattura rettificativa",
		rectifica: (n, f) => `Rettifica la fattura n. ${n}${f ? ` del ${f}` : ""}.`,
		causa: "Causa",
		motivo: "Motivo",
		notas: "Note",
		formaPago: "Pagamento",
		transferencia: (i) => `Bonifico bancario a ${i}`,
		transferenciaCorta: "Bonifico bancario",
		refPago: (n) => `Indicare ${n} nella causale del bonifico.`,
		pagina: (p, n) => `Pagina ${p} di ${n}`,
		marcaPruebas: "DOCUMENTO DI PROVA",
		avisoPruebas: "Generato in modalità di prova: non valido come fattura.",
		hechoCon: "Creato con NomoTax · nomotax.io",
		archivoFactura: "Fattura",
		archivoPresupuesto: "Preventivo"
	},
	fr: {
		factura: "FACTURE",
		rectificativa: "FACTURE RECTIFICATIVE",
		presupuesto: "DEVIS",
		numero: "Numéro",
		fecha: "Date",
		vencimiento: "Échéance",
		validoHasta: "Valable jusqu'au",
		borrador: "Brouillon",
		de: "De",
		facturarA: "Facturer à",
		para: "Pour",
		nif: "N° TVA",
		concepto: "Désignation",
		cant: "Qté",
		precio: "Prix",
		impuesto: "TVA",
		importe: "Montant",
		base: "Total HT",
		sobreBase: "sur",
		retencion: "Retenue (IRPF)",
		total: "TOTAL TTC",
		bloqueRectificativa: "Facture rectificative",
		rectifica: (n, f) => `Rectifie la facture n° ${n}${f ? ` du ${f}` : ""}.`,
		causa: "Motif",
		motivo: "Détail",
		notas: "Notes",
		formaPago: "Paiement",
		transferencia: (i) => `Virement bancaire sur ${i}`,
		transferenciaCorta: "Virement bancaire",
		refPago: (n) => `Merci d’indiquer ${n} en référence du virement.`,
		pagina: (p, n) => `Page ${p} sur ${n}`,
		marcaPruebas: "DOCUMENT DE TEST",
		avisoPruebas: "Généré en mode test : non valable comme facture.",
		hechoCon: "Créé avec NomoTax · nomotax.io",
		archivoFactura: "Facture",
		archivoPresupuesto: "Devis"
	},
	de: {
		factura: "RECHNUNG",
		rectificativa: "KORREKTURRECHNUNG",
		presupuesto: "ANGEBOT",
		numero: "Nummer",
		fecha: "Datum",
		vencimiento: "Fällig am",
		validoHasta: "Gültig bis",
		borrador: "Entwurf",
		de: "Von",
		facturarA: "Rechnung an",
		para: "An",
		nif: "USt-IdNr.",
		concepto: "Beschreibung",
		cant: "Menge",
		precio: "Preis",
		impuesto: "MwSt.",
		importe: "Betrag",
		base: "Nettobetrag",
		sobreBase: "auf",
		retencion: "Quellensteuer (IRPF)",
		total: "GESAMT",
		bloqueRectificativa: "Korrekturrechnung",
		rectifica: (n, f) => `Korrigiert Rechnung Nr. ${n}${f ? ` vom ${f}` : ""}.`,
		causa: "Grund",
		motivo: "Details",
		notas: "Hinweise",
		formaPago: "Zahlung",
		transferencia: (i) => `Banküberweisung an ${i}`,
		transferenciaCorta: "Banküberweisung",
		refPago: (n) => `Bitte geben Sie ${n} als Verwendungszweck an.`,
		pagina: (p, n) => `Seite ${p} von ${n}`,
		marcaPruebas: "TESTDOKUMENT",
		avisoPruebas: "Im Testmodus erstellt: keine gültige Rechnung.",
		hechoCon: "Erstellt mit NomoTax · nomotax.io",
		archivoFactura: "Rechnung",
		archivoPresupuesto: "Angebot"
	},
	pt: {
		factura: "FATURA",
		rectificativa: "FATURA RETIFICATIVA",
		presupuesto: "ORÇAMENTO",
		numero: "Número",
		fecha: "Data",
		vencimiento: "Vencimento",
		validoHasta: "Válido até",
		borrador: "Rascunho",
		de: "De",
		facturarA: "Faturar a",
		para: "Para",
		nif: "NIF",
		concepto: "Descrição",
		cant: "Qtd.",
		precio: "Preço",
		impuesto: "IVA",
		importe: "Valor",
		base: "Base tributável",
		sobreBase: "sobre",
		retencion: "Retenção (IRPF)",
		total: "TOTAL",
		bloqueRectificativa: "Fatura retificativa",
		rectifica: (n, f) => `Retifica a fatura n.º ${n}${f ? ` de ${f}` : ""}.`,
		causa: "Causa",
		motivo: "Motivo",
		notas: "Notas",
		formaPago: "Pagamento",
		transferencia: (i) => `Transferência bancária para ${i}`,
		transferenciaCorta: "Transferência bancária",
		refPago: (n) => `Indique ${n} na referência da transferência.`,
		pagina: (p, n) => `Página ${p} de ${n}`,
		marcaPruebas: "DOCUMENTO DE TESTE",
		avisoPruebas: "Gerado em modo de teste: não válido como fatura.",
		hechoCon: "Criado com NomoTax · nomotax.io",
		archivoFactura: "Fatura",
		archivoPresupuesto: "Orcamento"
	}
};
// src/lib/pdfFactura.ts
const INK = [
	17,
	17,
	16
];
const LIMA = [
	205,
	245,
	100
];
const MUTED = [
	107,
	107,
	101
];
const LINE = [
	229,
	229,
	223
];
const BLANCO = [
	255,
	255,
	255
];
/** Color de marca del cliente (#RRGGBB) o lima de NomoTax si no hay o no es válido. */
function colorDeMarca(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
	if (!m) return LIMA;
	const n = parseInt(m[1], 16);
	return [
		n >> 16 & 255,
		n >> 8 & 255,
		n & 255
	];
}
/** Texto negro o blanco, el que mejor se lea sobre ese fondo. */
function textoSobre([r, g, b]) {
	const lin = (c) => {
		const v = c / 255;
		return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
	};
	return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b) > .179 ? INK : BLANCO;
}
/** Mezcla un color con blanco (a = proporción del color). */
function tinte([r, g, b], a) {
	return [
		Math.round(255 - (255 - r) * a),
		Math.round(255 - (255 - g) * a),
		Math.round(255 - (255 - b) * a)
	];
}
/** Contenido del QR de transferencia SEPA (estándar EPC069-12, versión 002: BIC opcional). */
function payloadEpc(nombre, iban, importe, referencia) {
	return [
		"BCD",
		"002",
		"1",
		"SCT",
		"",
		nombre.slice(0, 70),
		iban.replace(/\s+/g, "").toUpperCase(),
		`EUR${importe.toFixed(2)}`,
		"",
		"",
		referencia.slice(0, 140)
	].join("\n");
}
const PT = .3528;
/**
* Dibuja la factura o el presupuesto con el diseño de la app. Sin navegador:
* lo usan descargarPdf() (pdf.ts) y la facturación automática del servidor.
*/
async function construirPdf(tipo, d, emisor, marca, logo, modoPruebas = false) {
	const MARCA = colorDeMarca(marca?.color);
	const comercial = marca?.nombreComercial?.trim() || null;
	const doc = new jsPDF({
		unit: "mm",
		format: "a4"
	});
	const W = 210;
	const M = 18;
	const esFactura = tipo === "factura";
	const inv = d;
	const rectificativa = esFactura && inv.tipo === "rectificativa";
	const borrador = d.estado === "borrador";
	const pruebas = esFactura && modoPruebas;
	const T = TEXTOS[idiomaDePais(d.cliente?.pais)];
	const SUAVE = tinte(MARCA, .08);
	const nifEmisor = T.nif === "NIF" ? "NIF" : "NIF/VAT";
	const etiqueta = (txt, x, yy, align = "left") => {
		doc.setFont("helvetica", "bold");
		doc.setFontSize(7);
		doc.setTextColor(...MUTED);
		doc.text(txt.toUpperCase(), x, yy, { align });
	};
	doc.setFillColor(...MARCA);
	doc.rect(0, 0, W, 2, "F");
	let xE = M;
	let yE = 18;
	let finLogo = 0;
	if (logo) {
		const ratio = Math.min(42 / logo.w, 18 / logo.h);
		const lw = logo.w * ratio;
		const lh = logo.h * ratio;
		doc.addImage(logo.dataUrl, logo.formato, M, 13, lw, lh, void 0, "FAST");
		finLogo = 13 + lh;
		if (lw <= 30) {
			xE = M + lw + 5;
			yE = 17;
		} else yE = finLogo + 6;
	}
	const anchoE = 122 - xE;
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10.5);
	doc.setTextColor(...INK);
	const titular = emisor.nombre || "";
	const cabecera = comercial && comercial.toLowerCase() !== titular.toLowerCase() ? comercial : titular;
	doc.text(cabecera, xE, yE, { maxWidth: anchoE });
	yE += 4.6;
	if (cabecera !== titular && titular) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.8);
		doc.setTextColor(...INK);
		doc.text(titular, xE, yE, { maxWidth: anchoE });
		yE += 4.1;
	}
	doc.setFont("helvetica", "normal");
	doc.setFontSize(8.3);
	doc.setTextColor(...MUTED);
	const contacto = [emisor.email, emisor.telefono].filter(Boolean).join(" · ");
	for (const l of [
		emisor.nif ? `${nifEmisor} ${emisor.nif}` : "",
		...direccionCompleta(emisor),
		contacto
	]) {
		if (!l) continue;
		doc.text(l, xE, yE, { maxWidth: anchoE });
		yE += 3.8;
	}
	etiqueta(rectificativa ? T.rectificativa : esFactura ? T.factura : T.presupuesto, 192, 17, "right");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(19);
	doc.setTextColor(...INK);
	doc.text(d.numero || T.borrador, 192, 25.5, { align: "right" });
	const t = calcularTotales(d.lineas, Number(d.irpf_pct));
	const conPago = esFactura && Boolean(emisor.iban) && t.total > 0;
	let y = Math.max(yE, finLogo, 30) + 5;
	const celdas = [[T.fecha, fecha(d.fecha)]];
	if (esFactura && d.vencimiento) celdas.push([T.vencimiento, fecha(d.vencimiento)]);
	if (!esFactura && d.valido_hasta) celdas.push([T.validoHasta, fecha(d.valido_hasta)]);
	if (conPago) celdas.push([T.formaPago, T.transferenciaCorta]);
	doc.setFillColor(...SUAVE);
	doc.roundedRect(M, y, 174, 13, 2, 2, "F");
	const anchoCelda = 41;
	celdas.forEach(([k, v], i) => {
		const x = 23 + i * anchoCelda;
		etiqueta(k, x, y + 5);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9.3);
		doc.setTextColor(...INK);
		doc.text(v, x, y + 9.8);
	});
	y += 21;
	const c = d.cliente || {};
	const yCli = y;
	etiqueta(esFactura ? T.facturarA : T.para, 22, y + 2.4);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10.5);
	doc.setTextColor(...INK);
	const nombreCli = doc.splitTextToSize(c.nombre || "—", 170);
	doc.text(nombreCli, 22, y + 7.4);
	let yc = y + 7.4 + nombreCli.length * 4.4;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(8.5);
	doc.setTextColor(...MUTED);
	for (const l of [
		c.nif ? `${T.nif} ${c.nif}` : "",
		direccionCompleta({
			...c,
			provincia: c.provincia === c.ciudad ? null : c.provincia
		}).join(", "),
		c.email ?? ""
	]) {
		if (!l) continue;
		const partes = doc.splitTextToSize(l, 170);
		doc.text(partes, 22, yc);
		yc += partes.length * 3.9;
	}
	doc.setFillColor(...MARCA);
	doc.rect(M, yCli - .6, .8, yc - yCli - 2.4, "F");
	y = yc + 5;
	const pad = 3.2;
	const anchoConcepto = 86;
	const partirConcepto = (raw) => {
		const [primera, ...resto] = raw.split("\n");
		doc.setFont("helvetica", "bold");
		doc.setFontSize(9.3);
		const l1 = doc.splitTextToSize(primera || " ", anchoConcepto);
		const detalle = resto.join("\n").trim();
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.3);
		return {
			l1,
			l2: detalle ? doc.splitTextToSize(detalle, anchoConcepto) : []
		};
	};
	autoTable(doc, {
		startY: y,
		margin: {
			left: M,
			right: M,
			top: 18,
			bottom: 24
		},
		head: [[
			T.concepto,
			T.cant,
			T.precio,
			T.impuesto,
			T.importe
		].map((h) => h.toUpperCase())],
		body: d.lineas.map((l) => [
			l.concepto,
			num(l.cantidad),
			eur$1(l.precio),
			`${num(l.iva)} %`,
			eur$1(importeLinea(l))
		]),
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 9.3,
			cellPadding: {
				top: pad,
				bottom: pad,
				left: 0,
				right: 0
			},
			textColor: INK
		},
		headStyles: {
			textColor: MUTED,
			fontStyle: "bold",
			fontSize: 7,
			cellPadding: {
				top: 1.5,
				bottom: 2.4,
				left: 0,
				right: 0
			}
		},
		columnStyles: {
			0: {
				cellWidth: "auto",
				fontStyle: "bold",
				cellPadding: {
					top: pad,
					bottom: pad,
					left: 0,
					right: 4
				}
			},
			1: {
				halign: "right",
				cellWidth: 14
			},
			2: {
				halign: "right",
				cellWidth: 27
			},
			3: {
				halign: "right",
				cellWidth: 15
			},
			4: {
				halign: "right",
				cellWidth: 28
			}
		},
		didParseCell: (data) => {
			if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right";
			if (data.section === "body" && data.column.index === 0) {
				const { l1, l2 } = partirConcepto(String(data.cell.raw ?? ""));
				data.cell.text = [""];
				data.cell.styles.minCellHeight = 2 * pad + l1.length * 9.3 * 1.15 * PT + (l2.length ? .6 + l2.length * 8.3 * 1.2 * PT : 0);
			}
		},
		willDrawCell: (data) => {
			if (data.section !== "body" || data.column.index !== 0) return;
			const cell = data.cell;
			const { l1, l2 } = partirConcepto(String(cell.raw ?? ""));
			cell.text = [];
			const yy = cell.y + pad;
			doc.setFont("helvetica", "bold");
			doc.setFontSize(9.3);
			doc.setTextColor(...INK);
			doc.text(l1, cell.x, yy, {
				baseline: "top",
				lineHeightFactor: 1.15
			});
			if (l2.length) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(8.3);
				doc.setTextColor(...MUTED);
				doc.text(l2, cell.x, yy + l1.length * 9.3 * 1.15 * PT + .6, {
					baseline: "top",
					lineHeightFactor: 1.2
				});
			}
		},
		didDrawCell: (data) => {
			const { x, y: cy, width, height } = data.cell;
			if (data.section === "head") {
				doc.setDrawColor(...INK);
				doc.setLineWidth(.35);
			} else {
				doc.setDrawColor(...LINE);
				doc.setLineWidth(.2);
			}
			doc.line(x, cy + height, x + width, cy + height);
		}
	});
	y = doc.lastAutoTable.finalY + 6;
	const filasTot = 1 + t.desglose.length + (t.cuota_irpf ? 1 : 0);
	if (y + filasTot * 5.6 + 16 > 271) {
		doc.addPage();
		y = 24;
	}
	const xl = 118;
	const xv = 188;
	const fila = (label, valor) => {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9);
		doc.setTextColor(...MUTED);
		doc.text(label, xl, y);
		doc.setTextColor(...INK);
		doc.text(valor, xv, y, { align: "right" });
		y += 5.6;
	};
	y += 3;
	fila(T.base, eur$1(t.base));
	for (const r of t.desglose) fila(`${T.impuesto} ${num(r.tipo)} %${t.desglose.length > 1 ? ` (${T.sobreBase} ${eur$1(r.base)})` : ""}`, eur$1(r.cuota));
	if (t.cuota_irpf) fila(`${T.retencion} ${num(Number(d.irpf_pct))} %`, eur$1(-t.cuota_irpf));
	y -= 1.5;
	doc.setFillColor(...MARCA);
	doc.roundedRect(114, y, 78, 12, 2.2, 2.2, "F");
	doc.setTextColor(...textoSobre(MARCA));
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10);
	doc.text(T.total, xl, y + 7.6);
	doc.setFontSize(13);
	doc.text(eur$1(t.total), xv, y + 7.8, { align: "right" });
	y += 22;
	const asegurarHueco = (alto) => {
		if (y + alto > 271) {
			doc.addPage();
			y = 24;
		}
	};
	if (conPago && emisor.iban) {
		const moneda = (inv.moneda || "EUR").toUpperCase();
		let qr = null;
		if (moneda === "EUR" && !borrador && d.numero) try {
			qr = await (await import("npm:qrcode@^1.5.4")).toDataURL(payloadEpc(emisor.nombre || "", emisor.iban, t.total, d.numero), {
				errorCorrectionLevel: "M",
				margin: 0,
				width: 240
			});
		} catch {
			qr = null;
		}
		const alto = qr ? 26 : 19;
		asegurarHueco(alto);
		doc.setDrawColor(...LINE);
		doc.setLineWidth(.25);
		doc.roundedRect(M, y, 174, alto, 2, 2, "S");
		etiqueta(T.formaPago, 23, y + 6);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9.3);
		doc.setTextColor(...INK);
		doc.text(`${T.transferenciaCorta} · IBAN`, 23, y + 11.5);
		const xIban = 23 + doc.getTextWidth(`${T.transferenciaCorta} · IBAN`) + 1.6;
		doc.setFont("helvetica", "bold");
		doc.text(emisor.iban.toUpperCase().replace(/\s+/g, " ").trim(), xIban, y + 11.5);
		if (d.numero) {
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8.3);
			doc.setTextColor(...MUTED);
			doc.text(T.refPago(d.numero), 23, y + 16.2, { maxWidth: 134 });
		}
		if (qr) doc.addImage(qr, "PNG", 169, y + 4, 18, 18, void 0, "FAST");
		y += alto + 8;
	}
	const bloques = [];
	if (rectificativa) {
		const causa = CAUSAS_RECTIFICACION.find((c) => c.id === inv.causa_rectificacion);
		bloques.push([
			T.bloqueRectificativa,
			T.rectifica(inv.rectifica_numero ?? "", inv.rectifica_fecha ? fecha(inv.rectifica_fecha) : null) + (causa ? ` ${T.causa}: ${causa.id} · ${causa.nombre}.` : "") + (inv.motivo_rectificacion ? ` ${T.motivo}: ${inv.motivo_rectificacion}` : ""),
			false
		]);
	}
	if (d.notas) bloques.push([
		T.notas,
		d.notas,
		false
	]);
	if (emisor.pie_factura) bloques.push([
		"",
		emisor.pie_factura,
		true
	]);
	for (const [titulo, texto, discreto] of bloques) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(discreto ? 7.8 : 9);
		const partes = doc.splitTextToSize(texto, 174);
		asegurarHueco(partes.length * 4 + (titulo ? 5 : 0));
		if (titulo) {
			etiqueta(titulo, M, y);
			y += 4.5;
		}
		doc.setFont("helvetica", "normal");
		doc.setFontSize(discreto ? 7.8 : 9);
		doc.setTextColor(...discreto ? MUTED : INK);
		doc.text(partes, M, y);
		y += partes.length * (discreto ? 3.6 : 4.2) + 5;
	}
	const paginas = doc.getNumberOfPages();
	for (let p = 1; p <= paginas; p++) {
		doc.setPage(p);
		if (borrador || pruebas) {
			doc.saveGraphicsState();
			doc.setGState(new GState({ opacity: .07 }));
			doc.setFont("helvetica", "bold");
			doc.setFontSize(borrador ? 70 : 34);
			doc.setTextColor(...INK);
			doc.text(borrador ? T.borrador.toUpperCase() : T.marcaPruebas, W / 2, 190, {
				align: "center",
				angle: 30
			});
			doc.restoreGraphicsState();
		}
		doc.setDrawColor(...LINE);
		doc.setLineWidth(.2);
		doc.line(M, 282, 192, 282);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(7.3);
		doc.setTextColor(...MUTED);
		const pie = [emisor.nombre, emisor.nif ? `${nifEmisor} ${emisor.nif}` : null].filter(Boolean).join(" · ");
		doc.text(pie, M, 286.5);
		doc.text(T.pagina(p, paginas), 192, 286.5, { align: "right" });
		if (pruebas && !borrador) doc.text(T.avisoPruebas, W / 2, 279, { align: "center" });
		doc.setFontSize(6.3);
		doc.setTextColor(170, 170, 164);
		doc.textWithLink(T.hechoCon, W / 2 - doc.getTextWidth(T.hechoCon) / 2, 291, { url: "https://nomotax.io" });
	}
	return {
		doc,
		nombre: `${esFactura ? T.archivoFactura : T.archivoPresupuesto}-${d.numero || T.borrador.toLowerCase()}.pdf`
	};
}
// src/lib/planes.ts
const PLANES = [
	{
		id: "empresa_base",
		familia: "empresa",
		nombre: "Empresa Base",
		precio: 99,
		desc: "Para sociedades nuevas o con una operativa sencilla."
	},
	{
		id: "empresa_smart",
		familia: "empresa",
		nombre: "Empresa Smart",
		precio: 149,
		desc: "Para sociedades en crecimiento y con una operativa más activa."
	},
	{
		id: "empresa_max",
		familia: "empresa",
		nombre: "Empresa Max",
		precio: 249,
		desde: true,
		desc: "Para sociedades con mayor volumen, estructuras complejas y necesidades avanzadas."
	},
	{
		id: "autonomo_core",
		familia: "autonomo",
		nombre: "Autónomo Core",
		precio: 39,
		desc: "Para autónomos con poca facturación y necesidades básicas."
	},
	{
		id: "autonomo_plus",
		familia: "autonomo",
		nombre: "Autónomo Plus",
		precio: 59,
		desc: "Para autónomos con actividad regular y que necesitan más cobertura."
	},
	{
		id: "autonomo_pro",
		familia: "autonomo",
		nombre: "Autónomo Pro",
		precio: 89,
		desc: "Para autónomos con mayor volumen, operaciones especiales o situaciones complejas."
	}
];
const planPorId = (id) => PLANES.find((p) => p.id === id) ?? null;
/** Tarifa laboral de la web, por nómina y mes: 1 → 25€, 2–9 → 18€, 10 o más → 12€ */
function tarifaNomina(n) {
	if (n >= 10) return 12;
	if (n >= 2) return 18;
	return n === 1 ? 25 : 0;
}
const vacio = (v) => v === null || v === void 0 || v === "";
/** Parte laboral (siempre mensual): nóminas × precio por nómina */
function cuotaLaboral(d) {
	const nominas = Math.max(0, Math.floor(Number(d.plan_nominas ?? 0)));
	if (!nominas) return null;
	const personalizado = !vacio(d.plan_nomina_precio);
	const precio = personalizado ? Number(d.plan_nomina_precio) : tarifaNomina(nominas);
	return {
		nominas,
		precio,
		personalizado,
		total: nominas * precio,
		texto: `${nominas} ${nominas === 1 ? "nómina" : "nóminas"} × ${importe(precio)}`
	};
}
/** 149 → "149€" · 1788.5 → "1.788,50€" */
function importe(n) {
	const entero = Number.isInteger(n);
	return `${n.toLocaleString("es-ES", {
		minimumFractionDigits: entero ? 0 : 2,
		maximumFractionDigits: 2,
		useGrouping: "always"
	})}€`;
}
/** Lo que paga este cliente: precio personalizado o de tarifa, en su modalidad */
function cuotaCliente(d) {
	const plan = planPorId(d.plan);
	if (!plan) return null;
	const periodo = d.plan_periodo === "anual" ? "anual" : "mensual";
	const personalizado = d.plan_precio !== null && d.plan_precio !== void 0 && d.plan_precio !== "";
	const cantidad = personalizado ? Number(d.plan_precio) : periodo === "anual" ? plan.precio * 12 : plan.precio;
	return {
		plan,
		periodo,
		personalizado,
		cantidad,
		texto: `${!personalizado && plan.desde ? "Desde " : ""}${importe(cantidad)}/${periodo === "anual" ? "año" : "mes"}`,
		laboral: cuotaLaboral(d),
		/** Plan + laboral al mes (solo si paga mensual; en anual van por separado) */
		totalMes: periodo === "mensual" ? cantidad + (cuotaLaboral(d)?.total ?? 0) : null
	};
}
// src/lib/facturaPlan.ts
const MESES = [
	"enero",
	"febrero",
	"marzo",
	"abril",
	"mayo",
	"junio",
	"julio",
	"agosto",
	"septiembre",
	"octubre",
	"noviembre",
	"diciembre"
];
const MESES_CORTOS = [
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic"
];
const partes = (iso) => iso.slice(0, 10).split("-").map(Number);
const ultimoDia = (anio, mes1) => new Date(anio, mes1, 0).getDate();
/** «diciembre 26» */
const mesCorto = (anio, mes1) => `${MESES[mes1 - 1]} ${String(anio).slice(2)}`;
/**
* Si a este cliente le toca factura el día `hoy` (YYYY-MM-DD), devuelve sus líneas.
* - Mensual: plan + laboral cada mes, el mismo día que su fecha de cobro.
* - Anual: el plan una vez al año (en el aniversario) y el laboral cada mes.
*/
function facturaDelDia(p, hoy) {
	const cuota = cuotaCliente(p);
	if (!cuota || !p.plan_proximo_cobro) return null;
	const inicio = p.plan_proximo_cobro.slice(0, 10);
	if (hoy < inicio) return null;
	const [yI, mI, dI] = partes(inicio);
	const [y, m, d] = partes(hoy);
	if (d !== Math.min(dI, ultimoDia(y, m))) return null;
	const mesesDesdeInicio = (y - yI) * 12 + (m - mI);
	const tocaPlan = cuota.periodo === "mensual" || mesesDesdeInicio % 12 === 0;
	const lineas = [];
	if (tocaPlan) {
		let titulo;
		if (cuota.periodo === "anual") {
			const fin = new Date(y, m - 1 + 11, 1);
			titulo = `${cuota.plan.nombre} · anualidad ${MESES_CORTOS[m - 1]} ${String(y).slice(2)} – ${MESES_CORTOS[fin.getMonth()]} ${String(fin.getFullYear()).slice(2)}`;
		} else titulo = `${cuota.plan.nombre} · ${mesCorto(y, m)}`;
		lineas.push({
			concepto: `Plan ${titulo}\nAsesoría fiscal y contable`,
			cantidad: 1,
			precio: cuota.cantidad,
			iva: 21
		});
	}
	if (cuota.laboral) lineas.push({
		concepto: `Gestión laboral · ${mesCorto(y, m)}\nNóminas y seguros sociales`,
		cantidad: cuota.laboral.nominas,
		precio: cuota.laboral.precio,
		iva: 21
	});
	if (!lineas.length) return null;
	const resumen = [tocaPlan ? "Asesoría fiscal y contable" : null, cuota.laboral ? "gestión laboral" : null].filter(Boolean).join(" y ");
	return {
		lineas,
		resumen: `${resumen.charAt(0).toUpperCase()}${resumen.slice(1)} · ${mesCorto(y, m)}`
	};
}
// supabase/functions/facturar-planes/correo.ts
const APP_URL = "https://clientes.nomotax.io";
const LOGO = "https://clientes.nomotax.io/logo.png";
const WHATSAPP = "https://wa.me/34642757633";
const TELEFONO = "+34 642 75 76 33";
function esc(s) {
	return String(s ?? "").replace(/[&<>"]/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;"
	})[c]);
}
const eur = (n) => `${n.toLocaleString("es-ES", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	useGrouping: "always"
})}€`;
const fechaLarga = (iso) => (/* @__PURE__ */ new Date(iso + "T12:00:00Z")).toLocaleDateString("es-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "UTC"
});
function asuntoFactura(d) {
	return `${d.prueba ? "[PRUEBA] " : ""}Tu factura ${d.numero} de NomoTax`;
}
function textoFactura(d) {
	return [
		`Hola${d.nombre ? " " + d.nombre : ""},`,
		"",
		`Te adjuntamos la factura ${d.numero} del ${fechaLarga(d.fecha)}.`,
		"",
		...d.lineas.map((l) => `· ${l.concepto.split("\n")[0]}: ${eur(l.cantidad * l.precio)}`),
		`Total: ${eur(d.total)} (IVA incluido, retención descontada)`,
		"",
		d.iban ? `Pago por transferencia a ${d.iban}, indicando ${d.numero}.` : "",
		`También la tienes en tu Área de clientes, en Gastos: ${APP_URL}/gastos`,
		"",
		`¿Dudas? WhatsApp ${WHATSAPP} · ${TELEFONO} · info@nomotax.io`,
		"",
		"Un saludo,",
		"El equipo de NomoTax"
	].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
function htmlFactura(d) {
	const nombre = d.nombre ? " " + esc(d.nombre) : "";
	const fila = (izq, der, fuerte = false) => `
      <tr><td style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 Helvetica,Arial,sans-serif;color:${fuerte ? "#111110" : "#6b6b66"}">${izq}</td>
      <td align="right" style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 Helvetica,Arial,sans-serif;color:#111110;white-space:nowrap">${der}</td></tr>`;
	const conceptos = d.lineas.map((l) => {
		const [titulo, detalle] = l.concepto.split("\n");
		return `
      <tr><td style="padding:10px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 Helvetica,Arial,sans-serif;color:#111110">
        <strong>${esc(titulo)}</strong>${detalle ? `<br><span style="color:#6b6b66">${esc(detalle)}</span>` : ""}
        ${l.cantidad !== 1 ? `<br><span style="color:#6b6b66">${l.cantidad} × ${eur(l.precio)}</span>` : ""}
      </td>
      <td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 Helvetica,Arial,sans-serif;color:#111110;white-space:nowrap">${eur(l.cantidad * l.precio)}</td></tr>`;
	}).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:#111110;padding:26px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${LOGO}" width="40" height="40" alt="NomoTax" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font:600 18px Helvetica,Arial,sans-serif;color:#ffffff">NomoTax<br>
        <span style="font:500 11px Helvetica,Arial,sans-serif;letter-spacing:2px;color:#CDF564">${d.prueba ? "FACTURA DE PRUEBA" : "TU FACTURA"}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px 32px 8px 32px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110">
    <h1 style="margin:0 0 12px 0;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#111110">Hola${nombre}, aquí tienes tu factura</h1>
    <p style="margin:0 0 22px 0">Te adjuntamos en PDF la factura de este mes. Gracias por confiar en NomoTax.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px">
      <tr><td style="padding:18px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">FACTURA</span><br>
            <strong style="font-size:17px">${esc(d.numero)}</strong><br>
            <span style="color:#6b6b66">${fechaLarga(d.fecha)}</span>
          </td>
          <td align="right" valign="top" style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">TOTAL</span><br>
            <strong style="font-family:Menlo,Consolas,monospace;font-size:18px;background:#CDF564;padding:2px 8px;border-radius:6px;white-space:nowrap">${eur(d.total)}</strong>
          </td>
        </tr></table>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px 0">
      ${conceptos}
      ${fila("Base imponible", eur(d.base))}
      ${fila("IVA 21%", eur(d.cuota_iva))}
      ${d.cuota_irpf ? fila("Retención IRPF 15%", `−${eur(d.cuota_irpf)}`) : ""}
      ${fila("Total", eur(d.total), true)}
    </table>

    ${d.iban ? `<p style="margin:14px 0 0 0;font-size:14px;color:#6b6b66">Pago por transferencia a <strong style="color:#111110">${esc(d.iban)}</strong>, indicando <strong style="color:#111110">${esc(d.numero)}</strong>. En el PDF tienes un código QR para pagar desde la app de tu banco.</p>` : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#111110;border-radius:999px">
      <a href="${APP_URL}/gastos" style="display:inline-block;padding:14px 28px;font:600 15px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">Verla en el Área de clientes →</a>
    </td></tr></table>
    <p style="margin:0 0 18px 0;font-size:14px;color:#6b6b66">Ya está guardada en tus Gastos, lista para tu contabilidad: no tienes que subirla.</p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 Helvetica,Arial,sans-serif;color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">¿Dudas con la factura? Estamos a un mensaje:</p>
    <a href="${WHATSAPP}" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">${TELEFONO}</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
    <p style="margin:18px 0 0 0">Un saludo,<br><strong>El equipo de NomoTax</strong></p>
  </td></tr>
</table>
<p style="font:12px Helvetica,Arial,sans-serif;color:#9a9a94;margin:16px 0 0 0">NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}
// supabase/functions/facturar-planes/fuente.ts
const BUCKET = "documentos";
const DIAS_RECUPERAR = 3;
const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
	status,
	headers: { "Content-Type": "application/json" }
});
function primeraDeJson(nombre) {
	const raw = Deno.env.get(nombre);
	if (!raw) return void 0;
	try {
		const obj = JSON.parse(raw);
		if (typeof obj === "string") return obj;
		if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0];
	} catch {
		return raw;
	}
}
/** Fecha de hoy en Madrid, YYYY-MM-DD */
function hoyMadrid() {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(/* @__PURE__ */ new Date());
}
function restarDias(iso, n) {
	const d = /* @__PURE__ */ new Date(iso + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}
function aBase64(bytes) {
	let s = "";
	for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return btoa(s);
}
Deno.serve(async (req) => {
	if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
	const secreto = Deno.env.get("CRON_SECRET")?.trim();
	if (!secreto || req.headers.get("x-cron-secret")?.trim() !== secreto) return json({ error: "No autorizado" }, 401);
	let body = {};
	try {
		body = await req.json();
	} catch {
		body = {};
	}
	const hoy = body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : hoyMadrid();
	const simular = Boolean(body.simular);
	const prueba = Boolean(body.prueba);
	if (prueba && !body.cliente) return json({ error: "En modo prueba indica el cliente" }, 400);
	const clave = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!clave) return json({ error: "Falta la clave secreta de Supabase" }, 500);
	const db = createClient(Deno.env.get("SUPABASE_URL"), clave, { auth: {
		persistSession: false,
		autoRefreshToken: false
	} });
	const emailEmisor = (Deno.env.get("NOMOTAX_EMISOR_EMAIL") ?? "").trim().toLowerCase();
	if (!emailEmisor) return json({ error: "Falta el secreto NOMOTAX_EMISOR_EMAIL (email de tu perfil de cliente)" }, 500);
	const { data: emisor } = await db.from("profiles").select("*").ilike("email", emailEmisor).maybeSingle();
	if (!emisor) return json({ error: `No hay ningún perfil con el email ${emailEmisor}` }, 500);
	if (!emisor.nombre || !emisor.nif || !emisor.direccion) return json({ error: "Completa nombre, NIF y dirección en «Mi perfil» de la cuenta emisora" }, 500);
	let consulta = db.from("profiles").select("*").eq("role", "client").not("plan", "is", null).neq("id", emisor.id);
	if (body.cliente) {
		const c = body.cliente.trim();
		consulta = /^[0-9a-f-]{36}$/i.test(c) ? consulta.eq("id", c) : c.includes("@") ? consulta.ilike("email", c) : consulta.ilike("nombre", `%${c}%`);
	}
	const { data: clientes, error: eCli } = await consulta;
	if (eCli) return json({ error: eCli.message }, 500);
	const dias = Array.from({ length: 4 }, (_, i) => restarDias(hoy, DIAS_RECUPERAR - i));
	const resultado = [];
	if (prueba) {
		if ((clientes ?? []).length !== 1) return json({ error: `Encuentro ${(clientes ?? []).length} clientes con plan para «${body.cliente}»; tiene que ser uno` }, 400);
		const cli = clientes[0];
		const f = facturaDelDia({
			...cli,
			plan_proximo_cobro: hoy
		}, hoy);
		if (!f) return json({ error: "Ese cliente no tiene plan" }, 400);
		const totales = calcularTotales(f.lineas, 15);
		const destino = (body.enviar_a || cli.email_facturacion || cli.email || "").trim();
		try {
			const r = await emitir(db, emisor, cli, hoy, hoy, f, totales, destino, true);
			return json({
				hoy,
				prueba,
				emisor: emisor.email,
				facturas: [r]
			});
		} catch (e) {
			return json({ error: e instanceof Error ? e.message : String(e) }, 500);
		}
	}
	for (const cli of clientes ?? []) for (const dia of dias) {
		const f = facturaDelDia(cli, dia);
		if (!f) continue;
		const { data: hecha } = await db.from("facturas_plan").select("id").eq("cliente_id", cli.id).eq("periodo", dia).maybeSingle();
		if (hecha) continue;
		const totales = calcularTotales(f.lineas, 15);
		const destino = (cli.email_facturacion || cli.email || "").trim();
		if (simular) {
			resultado.push({
				cliente: cli.nombre,
				dia,
				destino,
				lineas: f.lineas,
				...totales,
				desglose: void 0
			});
			continue;
		}
		try {
			resultado.push(await emitir(db, emisor, cli, dia, hoy, f, totales, destino));
		} catch (e) {
			console.error("facturar-planes", cli.nombre, e);
			resultado.push({
				cliente: cli.nombre,
				dia,
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}
	return json({
		hoy,
		simular,
		emisor: emisor.email,
		facturas: resultado
	});
});
async function emitir(db, emisor, cli, dia, hoy, f, t, destino, prueba = false) {
	const datosCliente = {
		nombre: cli.nombre,
		nif: cli.nif,
		email: destino || null,
		direccion: cli.direccion,
		cp: cli.cp,
		ciudad: cli.ciudad,
		provincia: cli.provincia,
		pais: cli.pais ?? "España"
	};
	let contactId = null;
	if (cli.nif) {
		const { data: c } = await db.from("contacts").select("id").eq("owner_id", emisor.id).eq("nif", cli.nif).maybeSingle();
		contactId = c?.id ?? null;
	}
	if (!contactId) {
		const { data: c, error } = await db.from("contacts").insert({
			owner_id: emisor.id,
			...datosCliente
		}).select("id").single();
		if (error) throw new Error(`Contacto: ${error.message}`);
		contactId = c.id;
	}
	const { data: factura, error: eFac } = await db.from("invoices").insert({
		owner_id: emisor.id,
		contact_id: contactId,
		origen: "app",
		cliente: datosCliente,
		serie: prueba ? "PRUEBA" : (emisor.serie_factura || "F").toUpperCase(),
		fecha: hoy,
		vencimiento: hoy,
		lineas: f.lineas,
		base: t.base,
		cuota_iva: t.cuota_iva,
		irpf_pct: 15,
		cuota_irpf: t.cuota_irpf,
		total: t.total,
		estado: "emitida",
		notas: prueba ? "Factura de PRUEBA del sistema de facturación automática. Sin validez fiscal." : null
	}).select("*").single();
	if (eFac) throw new Error(`Factura: ${eFac.message}`);
	const emisorPdf = factura.emisor ?? emisor;
	const logo = await cargarLogo(db, emisorPdf.logo_path);
	const { doc, nombre } = await construirPdf("factura", factura, emisorPdf, {
		color: emisor.color_marca,
		nombreComercial: emisor.nombre_comercial
	}, logo, prueba);
	const pdf = new Uint8Array(doc.output("arraybuffer"));
	const rutaEmisor = `${emisor.id}/facturas/${factura.numero}.pdf`;
	const up1 = await db.storage.from(BUCKET).upload(rutaEmisor, pdf, {
		contentType: "application/pdf",
		upsert: true
	});
	if (up1.error) throw new Error(`PDF emisor: ${up1.error.message}`);
	await db.from("invoices").update({ file_path: rutaEmisor }).eq("id", factura.id);
	const rutaCliente = `${cli.id}/gastos/${factura.numero}.pdf`;
	const up2 = await db.storage.from(BUCKET).upload(rutaCliente, pdf, {
		contentType: "application/pdf",
		upsert: true
	});
	if (up2.error) throw new Error(`PDF cliente: ${up2.error.message}`);
	const proveedor = emisor.nombre_comercial ? `${emisor.nombre_comercial} (${emisor.nombre})` : emisor.nombre;
	const { data: gasto, error: eGas } = await db.from("expenses").insert({
		owner_id: cli.id,
		fecha: hoy,
		proveedor,
		proveedor_nif: emisor.nif,
		numero: factura.numero,
		concepto: prueba ? `PRUEBA · ${f.resumen}` : f.resumen,
		categoria: "profesionales",
		base: t.base,
		iva_pct: 21,
		cuota_iva: t.cuota_iva,
		irpf_pct: 15,
		cuota_irpf: t.cuota_irpf,
		total: t.total,
		estado: "revisado",
		file_path: rutaCliente
	}).select("id").single();
	if (eGas) throw new Error(`Gasto del cliente: ${eGas.message}`);
	const { data: reg, error: eReg } = await db.from("facturas_plan").insert({
		cliente_id: cli.id,
		periodo: dia,
		invoice_id: factura.id,
		expense_id: gasto.id,
		email: destino || null
	}).select("id").single();
	if (eReg) throw new Error(`Registro: ${eReg.message}`);
	let enviada = false;
	let errorEnvio = null;
	if (destino) try {
		await enviarFactura(destino, {
			nombre: cli.nombre,
			numero: factura.numero,
			fecha: factura.fecha,
			lineas: f.lineas,
			base: t.base,
			cuota_iva: t.cuota_iva,
			cuota_irpf: t.cuota_irpf,
			total: t.total,
			iban: emisorPdf.iban ?? null,
			prueba
		}, nombre, pdf);
		enviada = true;
		await db.from("facturas_plan").update({ enviada_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", reg.id);
	} catch (e) {
		errorEnvio = e instanceof Error ? e.message : String(e);
		await db.from("facturas_plan").update({ error: errorEnvio }).eq("id", reg.id);
	}
	else errorEnvio = "El cliente no tiene email";
	return {
		cliente: cli.nombre,
		dia,
		numero: factura.numero,
		total: t.total,
		destino,
		enviada,
		error: errorEnvio
	};
}
async function cargarLogo(db, path) {
	if (!path) return null;
	try {
		const { data } = await db.storage.from(BUCKET).download(path);
		if (!data) return null;
		const tipo = (data.type || "").toLowerCase();
		const formato = tipo.includes("png") || path.endsWith(".png") ? "PNG" : tipo.includes("jpeg") || tipo.includes("jpg") || /\.jpe?g$/.test(path) ? "JPEG" : null;
		if (!formato) return null;
		const bytes = new Uint8Array(await data.arrayBuffer());
		const dataUrl = `data:image/${formato.toLowerCase()};base64,${aBase64(bytes)}`;
		const props = new jsPDF().getImageProperties(dataUrl);
		return {
			dataUrl,
			formato,
			w: props.width,
			h: props.height
		};
	} catch {
		return null;
	}
}
async function enviarFactura(email, datos, archivo, pdf) {
	const pass = Deno.env.get("SMTP_PASSWORD");
	if (!pass) throw new Error("Falta el secreto SMTP_PASSWORD");
	await nodemailer.createTransport({
		host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
		port: 465,
		secure: true,
		auth: {
			user: Deno.env.get("SMTP_USER") ?? "info@nomotax.io",
			pass
		}
	}).sendMail({
		from: "\"NomoTax\" <info@nomotax.io>",
		to: email,
		subject: asuntoFactura(datos),
		text: textoFactura(datos),
		html: htmlFactura(datos),
		attachments: [{
			filename: archivo,
			content: pdf,
			contentType: "application/pdf"
		}]
	});
}
