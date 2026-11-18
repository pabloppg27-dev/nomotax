// GENERADO con `node scripts/empaquetar-facturar.mjs enviar-factura` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → enviar-factura. No lo edites a mano.

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
const eur = (n) => `${agrupar(Number(n ?? 0), 2, true)}€`;
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
const LIMA$1 = [
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
	if (!m) return LIMA$1;
	const n = parseInt(m[1], 16);
	return [
		n >> 16 & 255,
		n >> 8 & 255,
		n & 255
	];
}
/** Texto negro o blanco, el que mejor se lea sobre ese fondo. */
function textoSobre$1([r, g, b]) {
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
			eur(l.precio),
			`${num(l.iva)}%`,
			eur(importeLinea(l))
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
	fila(T.base, eur(t.base));
	for (const r of t.desglose) fila(`${T.impuesto} ${num(r.tipo)}%${t.desglose.length > 1 ? ` (${T.sobreBase} ${eur(r.base)})` : ""}`, eur(r.cuota));
	if (t.cuota_irpf) fila(`${T.retencion} ${num(Number(d.irpf_pct))}%`, eur(-t.cuota_irpf));
	y -= 1.5;
	doc.setFillColor(...MARCA);
	doc.roundedRect(114, y, 78, 12, 2.2, 2.2, "F");
	doc.setTextColor(...textoSobre$1(MARCA));
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10);
	doc.text(T.total, xl, y + 7.6);
	doc.setFontSize(13);
	doc.text(eur(t.total), xv, y + 7.8, { align: "right" });
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
({}).DEV || {}.VITE_TARJETAS;
({}).DEV || {}.VITE_TARJETAS_CLIENTES;
demoForzada() || {}.VITE_TARJETAS_MODO === "real" || {}.VITE_TARJETAS_MODO === "demo" || {}.DEV;
/** Solo en local: abrir /tarjetas?demo=1 fuerza la demostración (y ?demo=0 la quita) durante esa sesión del navegador */
function demoForzada() {
	if (!{}.DEV || typeof window === "undefined") return false;
	try {
		const q = new URLSearchParams(window.location.search).get("demo");
		if (q === "1") sessionStorage.setItem("nt-tarjetas-demo", "1");
		if (q === "0") sessionStorage.removeItem("nt-tarjetas-demo");
		return sessionStorage.getItem("nt-tarjetas-demo") === "1";
	} catch {
		return false;
	}
}
// src/lib/correoFactura.ts
/**
* Correo con el que una empresa envía su factura a su cliente (función enviar-factura).
* Mismo diseño que el correo de las facturas de NomoTax (supabase/functions/facturar-planes/correo.ts):
* cabecera oscura con el logo y el nombre de la empresa, resumen con el total, conceptos, impuestos y pago.
* El asunto y el mensaje se editan en Configuración → Envío de facturas. Al pie, una marca discreta de NomoTax.
* Sin navegador: lo usan la vista previa de la app y la función del servidor.
*/
/** Cambia {cliente}, {numero}… por los datos de la factura (las que no existen se quedan como están) */
function rellenar(texto, d) {
	const v = {
		cliente: d.cliente?.trim() || "",
		numero: d.numero,
		total: eur(d.total),
		fecha: fecha(d.fecha),
		vencimiento: d.vencimiento ? fecha(d.vencimiento) : "—",
		empresa: d.empresa
	};
	return texto.replace(/\{\s*([a-zA-Z]+)\s*\}/g, (m, k) => k.toLowerCase() in v ? v[k.toLowerCase()] : m);
}
function esc(s) {
	return String(s ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[c]);
}
/** Textos fijos del diseño (el resto, de TEXTOS de la factura) */
const FRASES = {
	es: {
		etiqueta: "FACTURA",
		etiquetaRect: "FACTURA RECTIFICATIVA",
		atencion: (n) => `A la atención de ${n}`,
		titulo: (e) => `Factura de ${e}`,
		tituloRect: (e) => `Factura rectificativa de ${e}`,
		pago: (iban, num) => `Pago por transferencia a <strong style="color:#111110">${iban}</strong>, indicando la referencia <strong style="color:#111110">${num}</strong>.`,
		qr: "El PDF incluye un código QR para pagar desde su banco.",
		vence: "Vencimiento",
		adjunto: "Documento adjunto",
		dudas: "Si tiene cualquier duda, puede responder a este correo o contactarnos en:",
		saludo: "Atentamente,",
		enviadaCon: "Enviada con"
	},
	en: {
		etiqueta: "INVOICE",
		etiquetaRect: "CORRECTIVE INVOICE",
		atencion: (n) => `For the attention of ${n}`,
		titulo: (e) => `Invoice from ${e}`,
		tituloRect: (e) => `Corrective invoice from ${e}`,
		pago: (iban, num) => `Payment by bank transfer to <strong style="color:#111110">${iban}</strong>, quoting <strong style="color:#111110">${num}</strong> as the reference.`,
		qr: "The PDF includes a QR code to pay from your bank.",
		vence: "Due",
		adjunto: "Attached document",
		dudas: "If you have any questions, you can reply to this email or contact us at:",
		saludo: "Yours sincerely,",
		enviadaCon: "Sent with"
	}
};
const LIMA = "#CDF564";
function colorValido(hex, porDefecto = LIMA) {
	return /^#[0-9a-f]{6}$/i.test((hex ?? "").trim()) ? hex.trim() : porDefecto;
}
/** Cabecera y botón de los correos: negro de NomoTax salvo que la empresa elija otro color */
const NEGRO_CORREO = "#111110";
/** Relación de contraste entre dos colores (1 a 21; a partir de 3 se lee bien un texto grande o en negrita) */
function contraste(a, b) {
	const [x, y] = [luminancia(a), luminancia(b)];
	return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** El color de acento para escribir sobre la cabecera; si no se lee sobre ese fondo, blanco o negro */
function acentoSobre(acento, fondo) {
	return contraste(acento, fondo) >= 3 ? acento : textoSobre(fondo);
}
function luminancia(hex) {
	const n = parseInt(hex.slice(1), 16);
	const lin = (c) => {
		const v = c / 255;
		return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
	};
	return .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
}
/** Negro o blanco, lo que mejor se lea sobre el color */
const textoSobre = (hex) => luminancia(hex) > .179 ? "#111110" : "#ffffff";
const FONT = "Helvetica,Arial,sans-serif";
/** HTML del correo, con el diseño de las facturas de NomoTax y la marca de la empresa */
function htmlCorreoFactura(mensaje, d, diseno) {
	const lengua = idiomaDePais(d.pais) === "es" ? "es" : "en";
	const T = TEXTOS[lengua];
	const F = FRASES[lengua];
	const color = colorValido(diseno.color);
	const cabecera = colorValido(diseno.cabecera, NEGRO_CORREO);
	const textoCab = textoSobre(cabecera);
	const acento = acentoSobre(color, cabecera);
	const rect = Boolean(diseno.rectificativa);
	const cliente = d.cliente?.trim() ?? "";
	const parrafos = mensaje.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px 0">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
	const logo = diseno.logo ? `<td style="padding-right:14px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;padding:6px 8px"><img src="${esc(diseno.logo)}" alt="" height="32" style="display:block;height:32px;width:auto;max-width:150px;border:0"></td></tr></table></td>` : "";
	const fila = (izq, der, fuerte = false) => `
      <tr><td style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 ${FONT};color:${fuerte ? "#111110" : "#6b6b66"}">${izq}</td>
      <td align="right" style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 ${FONT};color:#111110;white-space:nowrap">${der}</td></tr>`;
	const lineas = (d.lineas ?? []).filter((l) => l.concepto?.trim() || Number(l.precio));
	const conceptos = lineas.map((l) => {
		const [titulo, ...resto] = String(l.concepto ?? "").split("\n");
		const detalle = resto.join(" ").trim();
		const cantidad = Number(l.cantidad || 0);
		const extra = [cantidad !== 1 ? `${cantidad.toLocaleString("es-ES")} × ${eur(Number(l.precio))}` : "", Number(l.descuento) ? `−${Number(l.descuento)}%` : ""].filter(Boolean).join(" · ");
		return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 ${FONT};color:#111110">
        <strong>${esc(titulo)}</strong>${detalle ? `<br><span style="color:#6b6b66">${esc(detalle)}</span>` : ""}${extra ? `<br><span style="color:#6b6b66">${esc(extra)}</span>` : ""}
      </td>
      <td align="right" valign="top" style="padding:12px 0 12px 16px;border-bottom:1px solid #e7e7e2;font:14px/1.45 ${FONT};color:#111110;white-space:nowrap">${esc(eur(importeLinea(l)))}</td></tr>`;
	}).join("");
	let impuestos = "";
	if (lineas.length) {
		const irpf = Number(d.irpf_pct || 0);
		const t = calcularTotales(lineas, irpf);
		impuestos = fila(esc(T.base), esc(eur(t.base))) + t.desglose.map((x) => fila(`${esc(T.impuesto)} ${x.tipo}%`, esc(eur(x.cuota)))).join("") + (t.cuota_irpf ? fila(`${esc(T.retencion)} ${irpf}%`, `−${esc(eur(t.cuota_irpf))}`) : "") + fila(esc(T.total.charAt(0) + T.total.slice(1).toLowerCase()), esc(eur(d.total)), true);
	}
	const iban = diseno.iban?.toUpperCase().replace(/\s+/g, " ").trim();
	const contacto = [diseno.respuesta ? `<a href="mailto:${esc(diseno.respuesta)}" style="color:#111110;font-weight:600">${esc(diseno.respuesta)}</a>` : "", diseno.telefono ? `<a href="tel:${esc(diseno.telefono.replace(/[^\d+]/g, ""))}" style="color:#111110;font-weight:600">${esc(diseno.telefono)}</a>` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:${cabecera};padding:24px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${logo}
      <td valign="middle" style="font:600 18px/1.3 ${FONT};color:${textoCab}">${esc(diseno.empresa)}<br>
        <span style="font:500 11px ${FONT};letter-spacing:2px;color:${acento}">${rect ? F.etiquetaRect : F.etiqueta}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${color}">&nbsp;</td></tr>
  <tr><td style="padding:30px 32px 8px 32px;font:15px/1.6 ${FONT};color:#111110">
    ${cliente ? `<p style="margin:0 0 4px 0;font:13px/1.5 ${FONT};color:#6b6b66">${esc(F.atencion(cliente))}</p>` : ""}
    <h1 style="margin:0 0 18px 0;font:600 24px/1.25 ${FONT};color:#111110">${esc(rect ? F.tituloRect(diseno.empresa) : F.titulo(diseno.empresa))}</h1>
    ${parrafos}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px;margin-top:8px">
      <tr><td style="padding:18px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:14px/1.5 ${FONT};color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${rect ? F.etiquetaRect : F.etiqueta}</span><br>
            <strong style="font-size:17px">${esc(d.numero)}</strong><br>
            <span style="color:#6b6b66">${esc(fecha(d.fecha))}${d.vencimiento ? ` · ${F.vence}: ${esc(fecha(d.vencimiento))}` : ""}</span>
          </td>
          <td align="right" valign="top" style="font:14px/1.5 ${FONT};color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${esc(T.total)}</span><br>
            <strong style="font-family:Menlo,Consolas,monospace;font-size:18px;background:${color};color:${textoSobre(color)};padding:2px 8px;border-radius:6px;white-space:nowrap">${esc(eur(d.total))}</strong>
          </td>
        </tr></table>
      </td></tr>
    </table>

    ${conceptos ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px 0">
      ${conceptos}
      ${impuestos}
    </table>` : ""}

    ${iban ? `<p style="margin:16px 0 0 0;font-size:14px;color:#6b6b66">${F.pago(esc(iban), esc(d.numero))} ${F.qr}</p>` : ""}
    <p style="margin:16px 0 22px 0;font-size:13px;color:#6b6b66">📎 ${F.adjunto}: ${esc(T.archivoFactura)}-${esc(d.numero)}.pdf</p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 ${FONT};color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">${F.dudas}</p>
    ${contacto}
    <p style="margin:18px 0 0 0">${F.saludo}<br><strong>${esc(diseno.empresa)}</strong></p>
  </td></tr>
</table>
<p style="font:12px ${FONT};color:#9a9a94;margin:16px 0 0 0">${F.enviadaCon} NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}
/** Versión en texto plano (algunos programas de correo la prefieren) */
function textoCorreoFactura(mensaje, d, diseno) {
	const lengua = idiomaDePais(d.pais) === "es" ? "es" : "en";
	const T = TEXTOS[lengua];
	const F = FRASES[lengua];
	const cliente = d.cliente?.trim() ?? "";
	const lineas = (d.lineas ?? []).filter((l) => l.concepto?.trim() || Number(l.precio));
	const iban = diseno.iban?.toUpperCase().replace(/\s+/g, " ").trim();
	return [
		cliente ? F.atencion(cliente) : "",
		diseno.rectificativa ? F.tituloRect(diseno.empresa) : F.titulo(diseno.empresa),
		"",
		mensaje.trim(),
		"",
		`${diseno.rectificativa ? F.etiquetaRect : F.etiqueta} ${d.numero} · ${fecha(d.fecha)}`,
		...lineas.map((l) => `· ${String(l.concepto).split("\n")[0]}: ${eur(importeLinea(l))}`),
		`${T.total}: ${eur(d.total)}`,
		iban ? F.pago(iban, d.numero).replace(/<[^>]+>/g, "") : "",
		"",
		F.dudas,
		[diseno.respuesta, diseno.telefono].filter(Boolean).join(" · "),
		"",
		F.saludo,
		diseno.empresa,
		"",
		`— ${F.enviadaCon} NomoTax · nomotax.io`
	].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
// supabase/functions/_compartido/smtp.ts
const desdeB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function claveAes() {
	const secreto = Deno.env.get("SMTP_CLAVE");
	if (!secreto || secreto.length < 24) throw new Error("Falta el secreto SMTP_CLAVE (texto largo y aleatorio)");
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto));
	return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function descifrar(guardado) {
	const [v, iv, datos] = guardado.split(":");
	if (v !== "v1" || !iv || !datos) throw new Error("Contraseña guardada en un formato desconocido");
	const plano = await crypto.subtle.decrypt({
		name: "AES-GCM",
		iv: desdeB64(iv)
	}, await claveAes(), desdeB64(datos));
	return new TextDecoder().decode(plano);
}
function transporte(c, pass) {
	return nodemailer.createTransport({
		host: c.host,
		port: c.puerto,
		secure: c.seguridad === "ssl",
		requireTLS: c.seguridad === "starttls",
		auth: {
			user: c.usuario,
			pass
		},
		connectionTimeout: 1e4,
		greetingTimeout: 1e4,
		socketTimeout: 2e4
	});
}
/** El SMTP activo de la empresa con su contraseña, o null si envía con NomoTax */
async function smtpActivo(admin, ownerId) {
	const { data: config } = await admin.from("smtp_empresas").select("*").eq("owner_id", ownerId).eq("activo", true).maybeSingle();
	if (!config) return null;
	const { data: clave } = await admin.from("smtp_claves").select("clave_cifrada").eq("owner_id", ownerId).maybeSingle();
	if (!clave) return null;
	return {
		config,
		pass: await descifrar(clave.clave_cifrada)
	};
}
/** Error de SMTP en palabras normales (para la app) */
function explicarErrorSmtp(e) {
	const err = e;
	const m = err.message ?? String(e);
	if (/smtp auth.*disabled|SmtpClientAuthentication/i.test(m)) return "Tu cuenta de Microsoft tiene desactivado el envío por SMTP. Tu administrador debe activar «SMTP autenticado» o usa el envío con NomoTax.";
	if (err.code === "EAUTH" || err.responseCode === 535 || /auth|credentials|password|username/i.test(m)) return "El servidor no acepta el usuario o la contraseña. Revisa los datos (en Gmail hace falta una contraseña de aplicación).";
	if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || /timeout|timed out/i.test(m)) return "No se ha podido conectar con el servidor: revisa el servidor y el puerto.";
	if (err.code === "ENOTFOUND" || err.code === "EDNS" || /getaddrinfo|not known|dns/i.test(m)) return "No existe ese servidor de correo: revisa el nombre.";
	if (err.code === "ESOCKET" || /ssl|tls|certificate|wrong version/i.test(m)) return "Fallo de seguridad al conectar (SSL/TLS): prueba con el otro tipo de seguridad o puerto (465 SSL / 587 STARTTLS).";
	if (/sender|from address|not owned|send as/i.test(m)) return "El servidor no deja enviar con ese email de remitente: usa el mismo email con el que entras.";
	return `El servidor de correo ha respondido: ${m.slice(0, 200)}`;
}
// supabase/functions/enviar-factura/fuente.ts
const MAX_DESTINATARIOS = 5;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
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
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status,
	headers: {
		...CORS,
		"Content-Type": "application/json"
	}
});
/** Sin saltos de línea ni caracteres de control (cabeceras del correo) */
const linea = (s) => s.replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();
function emails(v) {
	const lista = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
	if (lista.some((e) => !EMAIL.test(e) || e.length > 254)) return null;
	return [...new Set(lista)];
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) return json({ error: "Falta la sesión" }, 401);
	const url = Deno.env.get("SUPABASE_URL");
	const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
	const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!publica || !secreta) return json({ error: "Faltan las claves de Supabase" }, 500);
	const asUser = createClient(url, publica, { global: { headers: { Authorization: authHeader } } });
	const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
	const user = userData?.user;
	if (!user) return json({ error: "Sesión no válida" }, 401);
	const admin = createClient(url, secreta, { auth: {
		persistSession: false,
		autoRefreshToken: false
	} });
	let body;
	try {
		body = await req.json();
	} catch {
		return json({ error: "Petición no válida" }, 400);
	}
	if (!body.invoice_id || !/^[0-9a-f-]{36}$/i.test(body.invoice_id)) return json({ error: "Falta la factura" }, 400);
	const { data: factura } = await asUser.from("invoices").select("*").eq("id", body.invoice_id).maybeSingle();
	if (!factura) return json({ error: "Factura no encontrada" }, 404);
	const inv = factura;
	if (inv.estado === "borrador" || !inv.numero) return json({ error: "Solo se pueden enviar facturas emitidas" }, 400);
	if (inv.origen !== "app") return json({ error: "Esta factura no se ha hecho en la app" }, 400);
	const { data: puede, error: ePuede } = await asUser.rpc("puede_emitir", { cuenta: inv.owner_id });
	let autorizado = puede === true;
	if (ePuede) {
		const { data: yo } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
		autorizado = user.id === inv.owner_id || yo?.role === "advisor";
	}
	if (!autorizado) return json({ error: "No puedes enviar facturas de esta empresa" }, 403);
	const para = emails(body.para);
	const cc = emails(body.cc ?? []);
	if (!para || !cc) return json({ error: "Hay algún email que no es válido" }, 400);
	if (!para.length) return json({ error: "Indica a quién se envía" }, 400);
	if (para.length + cc.length > MAX_DESTINATARIOS) return json({ error: `Como máximo ${MAX_DESTINATARIOS} destinatarios` }, 400);
	const asuntoRaw = linea(String(body.asunto ?? ""));
	const mensajeRaw = String(body.mensaje ?? "").replace(/\r\n/g, "\n").trim();
	if (!asuntoRaw || asuntoRaw.length > 200) return json({ error: "El asunto tiene que tener entre 1 y 200 caracteres" }, 400);
	if (!mensajeRaw || mensajeRaw.length > 5e3) return json({ error: "El mensaje tiene que tener entre 1 y 5.000 caracteres" }, 400);
	const limite = Number(Deno.env.get("FACTURAS_LIMITE_DIA") ?? 100);
	const { count } = await admin.from("envios_factura").select("id", {
		count: "exact",
		head: true
	}).eq("owner_id", inv.owner_id).gte("created_at", (/* @__PURE__ */ new Date(Date.now() - 864e5)).toISOString());
	if ((count ?? 0) >= limite) return json({ error: `Has llegado al límite de ${limite} envíos en 24 horas. Escríbenos si necesitas más.` }, 429);
	const { data: empresaPerfil } = await admin.from("profiles").select("*").eq("id", inv.owner_id).single();
	if (!empresaPerfil) return json({ error: "Empresa no encontrada" }, 404);
	const empresa = linea(empresaPerfil.nombre_comercial || empresaPerfil.nombre || empresaPerfil.email || "Empresa");
	const responder = (empresaPerfil.email_respuesta || empresaPerfil.email || "").trim().toLowerCase();
	const emisorPdf = inv.emisor ?? empresaPerfil;
	const logo = logoDeLaApp(body.logo);
	const { doc, nombre: archivo } = await construirPdf("factura", inv, emisorPdf, {
		color: empresaPerfil.color_marca,
		nombreComercial: empresaPerfil.nombre_comercial
	}, logo?.pdf ?? null, false);
	const pdf = new Uint8Array(doc.output("arraybuffer"));
	const datos = {
		cliente: inv.cliente?.nombre ?? null,
		numero: inv.numero,
		fecha: inv.fecha,
		vencimiento: inv.vencimiento,
		total: Number(inv.total),
		empresa,
		pais: inv.cliente?.pais ?? null,
		lineas: inv.lineas,
		irpf_pct: Number(inv.irpf_pct)
	};
	const asunto = linea(rellenar(asuntoRaw, datos));
	const mensaje = rellenar(mensajeRaw, datos);
	const diseno = {
		empresa,
		color: empresaPerfil.color_marca,
		cabecera: empresaPerfil.color_cabecera ?? null,
		logo: logo ? "cid:logo-empresa" : null,
		respuesta: responder || null,
		telefono: emisorPdf.telefono ?? empresaPerfil.telefono ?? null,
		iban: emisorPdf.iban ?? null,
		rectificativa: inv.tipo === "rectificativa"
	};
	let propioSmtp = null;
	try {
		propioSmtp = await smtpActivo(admin, inv.owner_id);
	} catch (e) {
		console.error("enviar-factura: SMTP de la empresa:", e instanceof Error ? e.message : e);
		return json({ error: "No se ha podido usar tu correo de envío. Revisa Configuración → Correo." }, 500);
	}
	const mail = (desde) => ({
		from: desde,
		...responder && responder !== desde.address ? { replyTo: {
			name: empresa,
			address: responder
		} } : {},
		to: para,
		...cc.length ? { cc } : {},
		...empresaPerfil.correo_copia && responder && !para.includes(responder) && !cc.includes(responder) ? { bcc: responder } : {},
		subject: asunto,
		text: textoCorreoFactura(mensaje, datos, diseno),
		html: htmlCorreoFactura(mensaje, datos, diseno),
		attachments: [{
			filename: archivo,
			content: pdf,
			contentType: "application/pdf"
		}, ...logo ? [{
			filename: `logo.${logo.ext}`,
			content: logo.bytes,
			contentType: logo.tipo,
			cid: "logo-empresa"
		}] : []]
	});
	let errorEnvio = null;
	let errorParaUsuario = "No se ha podido enviar el correo. Prueba otra vez en unos minutos.";
	let remitente;
	if (propioSmtp) {
		const c = propioSmtp.config;
		remitente = c.remitente_email;
		try {
			await transporte(c, propioSmtp.pass).sendMail(mail({
				name: c.remitente_nombre || empresa,
				address: c.remitente_email
			}));
		} catch (e) {
			errorEnvio = e instanceof Error ? e.message : String(e);
			errorParaUsuario = `Tu servidor de correo no ha enviado la factura. ${explicarErrorSmtp(e)}`;
			await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", inv.owner_id);
		}
	} else {
		const propio = Deno.env.get("SMTP_FACTURAS_PASSWORD");
		const usuario = propio ? Deno.env.get("SMTP_FACTURAS_USER") ?? "invoice@nomotax.io" : Deno.env.get("SMTP_USER") ?? "info@nomotax.io";
		const pass = propio ?? Deno.env.get("SMTP_PASSWORD");
		if (!pass) return json({ error: "Falta configurar el correo de envío (SMTP_PASSWORD)" }, 500);
		const alias = (Deno.env.get("FACTURAS_FROM") ?? "invoice@nomotax.io").trim().toLowerCase();
		const t = nodemailer.createTransport({
			host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
			port: 465,
			secure: true,
			auth: {
				user: usuario,
				pass
			}
		});
		const enviar = (desde) => t.sendMail(mail({
			name: `${empresa} vía NomoTax`,
			address: desde
		}));
		remitente = alias;
		try {
			await enviar(alias);
		} catch (e) {
			if (alias !== usuario.toLowerCase()) {
				console.warn(`enviar-factura: no se ha podido enviar como ${alias}, se reintenta desde ${usuario}: ${e instanceof Error ? e.message : e}`);
				remitente = usuario;
				try {
					await enviar(usuario);
				} catch (e2) {
					errorEnvio = e2 instanceof Error ? e2.message : String(e2);
				}
			} else errorEnvio = e instanceof Error ? e.message : String(e);
		}
	}
	await admin.from("envios_factura").insert({
		owner_id: inv.owner_id,
		invoice_id: inv.id,
		enviado_por: user.id,
		para,
		cc,
		asunto,
		error: errorEnvio
	});
	if (errorEnvio) {
		console.error("enviar-factura:", errorEnvio);
		return json({ error: errorParaUsuario }, 502);
	}
	const enviadaAt = (/* @__PURE__ */ new Date()).toISOString();
	await admin.from("invoices").update({
		enviada_at: enviadaAt,
		enviada_a: [...para, ...cc].join(", ")
	}).eq("id", inv.id);
	return json({
		ok: true,
		enviada_at: enviadaAt,
		enviada_a: [...para, ...cc].join(", "),
		remitente
	});
});
/** Logo JPEG (data URL) que manda la app. Se comprueba que es un JPEG pequeño; no se descodifica. */
function logoDeLaApp(v) {
	if (!v || typeof v !== "object") return null;
	const { dataUrl, w, h } = v;
	if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > 4e5) return null;
	const ancho = Math.round(Number(w));
	const alto = Math.round(Number(h));
	if (!(ancho >= 1 && ancho <= 600 && alto >= 1 && alto <= 600)) return null;
	try {
		const bin = atob(dataUrl.slice(23));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		if (bytes[0] !== 255 || bytes[1] !== 216) return null;
		return {
			pdf: {
				dataUrl,
				formato: "JPEG",
				w: ancho,
				h: alto
			},
			bytes,
			tipo: "image/jpeg",
			ext: "jpg"
		};
	} catch {
		return null;
	}
}
