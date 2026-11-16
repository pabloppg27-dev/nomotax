// GENERADO con `node scripts/empaquetar-facturar.mjs vista-socio` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → vista-socio. No lo edites a mano.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
// src/lib/contabilidad.ts
/** Cuenta de gasto según la categoría del gasto */
const CUENTA_CATEGORIA = {
	compras: "600",
	suministros: "628",
	alquiler: "621",
	software: "629",
	material: "629",
	profesionales: "623",
	publicidad: "627",
	viajes: "629",
	vehiculo: "628",
	formacion: "629",
	seguros: "625",
	bancos: "626",
	tributos: "631",
	otros: "629"
};
const LARGO = 8;
/** 430 + 3 → 43000003 · 4751 → 47510000 */
function subcuenta(base, n = 0) {
	const s = base.padEnd(LARGO, "0");
	if (!n) return s;
	const num = String(n);
	return s.slice(0, LARGO - num.length) + num;
}
const r2$1 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function finDeMes$1(anio, mes) {
	return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}
function hoy() {
	const d = /* @__PURE__ */ new Date();
	return (/* @__PURE__ */ new Date(d.getTime() - d.getTimezoneOffset() * 6e4)).toISOString().slice(0, 10);
}
function generarAsientos(d) {
	const nombres = {};
	const lista = [];
	const hasta = d.hasta ?? hoy();
	const subClientes = /* @__PURE__ */ new Map();
	const subAcreedores = /* @__PURE__ */ new Map();
	const clienteDe = (f) => {
		const clave = f.contact_id ?? (f.cliente?.nif || f.cliente?.nombre || "sin-cliente").toString().toUpperCase();
		let c = subClientes.get(clave);
		if (!c) {
			c = subcuenta("430", subClientes.size + 1);
			subClientes.set(clave, c);
			nombres[c] = f.cliente?.nombre || "Cliente sin nombre";
		}
		return c;
	};
	const acreedorDe = (g) => {
		const clave = (g.proveedor_nif || g.proveedor || "sin-proveedor").toUpperCase();
		let c = subAcreedores.get(clave);
		if (!c) {
			c = subcuenta(g.categoria === "compras" ? "400" : "410", subAcreedores.size + 1);
			subAcreedores.set(clave, c);
			nombres[c] = g.proveedor || "Proveedor sin nombre";
		}
		return c;
	};
	const facturas = [...d.facturas].filter((f) => f.estado !== "borrador").sort((a, b) => (a.fecha + a.created_at).localeCompare(b.fecha + b.created_at));
	for (const f of facturas) {
		const cli = clienteDe(f);
		const base = Number(f.base);
		const iva = Number(f.cuota_iva);
		const irpf = Number(f.cuota_irpf);
		const total = Number(f.total);
		const venta = subcuenta("705");
		const apuntes = [{
			cuenta: cli,
			debe: total,
			haber: 0
		}];
		if (irpf) apuntes.push({
			cuenta: subcuenta("473"),
			debe: irpf,
			haber: 0
		});
		apuntes.push({
			cuenta: venta,
			debe: 0,
			haber: base
		});
		if (iva) apuntes.push({
			cuenta: subcuenta("477"),
			debe: 0,
			haber: iva
		});
		lista.push({
			fecha: f.fecha,
			concepto: `${f.tipo === "rectificativa" ? "Rectificativa" : "Factura"} ${f.numero ?? ""} · ${f.cliente?.nombre ?? ""}`.trim(),
			origen: "factura",
			documento: f.numero ?? void 0,
			apuntes
		});
		if (f.estado === "cobrada" && total) lista.push({
			fecha: f.fecha_cobro ?? f.fecha,
			concepto: `${total < 0 ? "Abono" : "Cobro"} ${f.numero ?? ""} · ${f.cliente?.nombre ?? ""}`.trim(),
			origen: "cobro",
			documento: f.numero ?? void 0,
			apuntes: [{
				cuenta: subcuenta("572"),
				debe: total,
				haber: 0
			}, {
				cuenta: cli,
				debe: 0,
				haber: total
			}]
		});
	}
	const inmoPorGasto = new Map(d.inmovilizados.filter((i) => i.expense_id).map((i) => [i.expense_id, i]));
	const gastos = [...d.gastos].filter((g) => g.estado === "revisado" && g.fecha).sort((a, b) => (a.fecha + a.created_at).localeCompare(b.fecha + b.created_at));
	for (const g of gastos) {
		const acr = acreedorDe(g);
		const base = Number(g.base);
		const iva = Number(g.cuota_iva);
		const irpf = Number(g.cuota_irpf);
		const aPagar = r2$1(base + iva - irpf);
		const inmo = g.revision === "inmovilizado" ? inmoPorGasto.get(g.id) : void 0;
		const apuntes = [{
			cuenta: inmo ? subcuenta(inmo.cuenta) : subcuenta(g.cuenta || CUENTA_CATEGORIA[g.categoria] || "629"),
			debe: base,
			haber: 0
		}];
		if (iva) apuntes.push({
			cuenta: subcuenta("472"),
			debe: iva,
			haber: 0
		});
		apuntes.push({
			cuenta: acr,
			debe: 0,
			haber: aPagar
		});
		if (irpf) apuntes.push({
			cuenta: subcuenta("4751"),
			debe: 0,
			haber: irpf
		});
		lista.push({
			fecha: g.fecha,
			concepto: `Factura recibida ${g.numero ?? ""} · ${g.proveedor ?? ""}`.replace(/\s+/g, " ").trim(),
			origen: "gasto",
			documento: g.numero ?? void 0,
			apuntes
		});
		if (g.pagado !== false && aPagar) lista.push({
			fecha: g.fecha_pago ?? g.fecha,
			concepto: `Pago ${g.numero ?? ""} · ${g.proveedor ?? ""}`.replace(/\s+/g, " ").trim(),
			origen: "pago",
			documento: g.numero ?? void 0,
			apuntes: [{
				cuenta: acr,
				debe: aPagar,
				haber: 0
			}, {
				cuenta: subcuenta("572"),
				debe: 0,
				haber: aPagar
			}]
		});
	}
	for (const n of d.nominas.filter((x) => x.estado === "publicada")) {
		const fecha = finDeMes$1(n.anio, n.mes);
		const quien = n.trabajador_nombre || n.nombre_leido || "trabajador";
		const ssTotal = r2$1(Number(n.ss_trabajador) + Number(n.ss_empresa));
		const apuntes = [{
			cuenta: subcuenta("640"),
			debe: Number(n.bruto),
			haber: 0
		}];
		if (Number(n.ss_empresa)) apuntes.push({
			cuenta: subcuenta("642"),
			debe: Number(n.ss_empresa),
			haber: 0
		});
		if (ssTotal) apuntes.push({
			cuenta: subcuenta("476"),
			debe: 0,
			haber: ssTotal
		});
		if (Number(n.irpf)) apuntes.push({
			cuenta: subcuenta("4751"),
			debe: 0,
			haber: Number(n.irpf)
		});
		apuntes.push({
			cuenta: subcuenta("465"),
			debe: 0,
			haber: Number(n.neto)
		});
		lista.push({
			fecha,
			concepto: `Nómina ${String(n.mes).padStart(2, "0")}/${n.anio} · ${quien}`,
			origen: "nomina",
			apuntes
		});
		if (Number(n.neto)) lista.push({
			fecha,
			concepto: `Pago nómina ${String(n.mes).padStart(2, "0")}/${n.anio} · ${quien}`,
			origen: "pago",
			apuntes: [{
				cuenta: subcuenta("465"),
				debe: Number(n.neto),
				haber: 0
			}, {
				cuenta: subcuenta("572"),
				debe: 0,
				haber: Number(n.neto)
			}]
		});
	}
	for (const a of amortizaciones(d.inmovilizados, hasta)) lista.push(a);
	for (const m of d.manuales) lista.push({
		fecha: m.fecha,
		concepto: m.concepto,
		origen: m.tipo === "apertura" ? "apertura" : "manual",
		apuntes: (m.lineas ?? []).map((l) => ({
			cuenta: l.cuenta.length < LARGO ? subcuenta(l.cuenta) : l.cuenta,
			debe: Number(l.debe) || 0,
			haber: Number(l.haber) || 0
		}))
	});
	const peso = (o) => o === "apertura" ? 0 : o === "amortizacion" ? 2 : 1;
	lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || peso(a.origen) - peso(b.origen));
	let anio = "";
	let n = 0;
	return {
		asientos: lista.map((a) => {
			if (a.fecha.slice(0, 4) !== anio) {
				anio = a.fecha.slice(0, 4);
				n = 0;
			}
			n++;
			return {
				...a,
				n,
				apuntes: a.apuntes.filter((x) => x.debe || x.haber).map((x) => ({
					...x,
					debe: r2$1(x.debe),
					haber: r2$1(x.haber)
				}))
			};
		}),
		nombres
	};
}
/** Cuotas de amortización mensuales (lineales, prorrateando el primer mes por días) */
function amortizaciones(inmovilizados, hasta) {
	const out = [];
	for (const i of inmovilizados) {
		const valor = Number(i.valor);
		const anual = valor * Number(i.coeficiente) / 100;
		if (!anual) continue;
		let acumulado = 0;
		const inicio = /* @__PURE__ */ new Date(i.fecha_inicio + "T12:00:00Z");
		let anio = inicio.getUTCFullYear();
		let mes = inicio.getUTCMonth() + 1;
		const limite = i.fecha_baja && i.fecha_baja < hasta ? i.fecha_baja : hasta;
		for (let k = 0; k < 600; k++) {
			const fin = finDeMes$1(anio, mes);
			if (fin > limite) break;
			const diasMes = Number(fin.slice(8, 10));
			const factor = k === 0 ? (diasMes - inicio.getUTCDate() + 1) / diasMes : 1;
			let cuota = r2$1(anual / 12 * factor);
			if (acumulado + cuota > valor) cuota = r2$1(valor - acumulado);
			if (cuota <= 0) break;
			acumulado = r2$1(acumulado + cuota);
			out.push({
				fecha: fin,
				concepto: `Amortización ${String(mes).padStart(2, "0")}/${anio} · ${i.nombre}`,
				origen: "amortizacion",
				apuntes: [{
					cuenta: subcuenta(i.cuenta.startsWith("20") ? "680" : "681"),
					debe: cuota,
					haber: 0
				}, {
					cuenta: subcuenta(i.cuenta_amortizacion),
					debe: 0,
					haber: cuota
				}]
			});
			mes++;
			if (mes > 12) {
				mes = 1;
				anio++;
			}
		}
	}
	return out;
}
function entre(asientos, desde, hasta) {
	return asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta);
}
/** Saldo (debe − haber) de las cuentas que empiezan por algún prefijo */
function saldo(asientos, prefijos, excluir = []) {
	let s = 0;
	for (const a of asientos) for (const p of a.apuntes) if (prefijos.some((x) => p.cuenta.startsWith(x)) && !excluir.some((x) => p.cuenta.startsWith(x))) s += p.debe - p.haber;
	return r2$1(s);
}
/** Cuenta de pérdidas y ganancias (modelo PYMES) del periodo */
function perdidasYGanancias(asientos) {
	const ing = (p, ex = []) => -saldo(asientos, p, ex);
	const gas = (p, ex = []) => -saldo(asientos, p, ex);
	const cifra = ing(["70"]);
	const aprov = gas(["60", "61"]);
	const otrosIng = ing(["75"]);
	const personal = gas(["64"]);
	const otrosGastos = gas([
		"62",
		"631",
		"634",
		"65"
	]);
	const amort = gas(["68"]);
	const excep = ing(["778"]) + gas(["678"]);
	const explotacion = r2$1(cifra + aprov + otrosIng + personal + otrosGastos + amort + excep);
	const ingFin = ing(["76"]);
	const gasFin = gas(["66"]);
	const financiero = r2$1(ingFin + gasFin);
	const antes = r2$1(explotacion + financiero);
	const impuesto = gas(["630"]);
	const resultado = r2$1(antes + impuesto);
	return {
		resultado,
		lineas: [
			{
				codigo: "1",
				nombre: "Importe neto de la cifra de negocios",
				importe: cifra,
				nivel: 1
			},
			{
				codigo: "4",
				nombre: "Aprovisionamientos",
				importe: aprov,
				nivel: 1
			},
			{
				codigo: "5",
				nombre: "Otros ingresos de explotación",
				importe: otrosIng,
				nivel: 1
			},
			{
				codigo: "6",
				nombre: "Gastos de personal",
				importe: personal,
				nivel: 1
			},
			{
				codigo: "7",
				nombre: "Otros gastos de explotación",
				importe: otrosGastos,
				nivel: 1
			},
			{
				codigo: "8",
				nombre: "Amortización del inmovilizado",
				importe: amort,
				nivel: 1
			},
			{
				codigo: "12",
				nombre: "Resultados excepcionales",
				importe: r2$1(excep),
				nivel: 1
			},
			{
				codigo: "A",
				nombre: "RESULTADO DE EXPLOTACIÓN",
				importe: explotacion,
				nivel: 0,
				total: true
			},
			{
				codigo: "13",
				nombre: "Ingresos financieros",
				importe: ingFin,
				nivel: 1
			},
			{
				codigo: "14",
				nombre: "Gastos financieros",
				importe: gasFin,
				nivel: 1
			},
			{
				codigo: "B",
				nombre: "RESULTADO FINANCIERO",
				importe: financiero,
				nivel: 0,
				total: true
			},
			{
				codigo: "C",
				nombre: "RESULTADO ANTES DE IMPUESTOS",
				importe: antes,
				nivel: 0,
				total: true
			},
			{
				codigo: "19",
				nombre: "Impuesto sobre beneficios",
				importe: impuesto,
				nivel: 1
			},
			{
				codigo: "D",
				nombre: "RESULTADO DEL EJERCICIO",
				importe: resultado,
				nivel: 0,
				total: true
			}
		]
	};
}
/** Balance de situación (modelo PYMES) a una fecha, con los asientos del ejercicio hasta esa fecha */
function balanceSituacion(asientos) {
	const resultado = perdidasYGanancias(asientos).resultado;
	const deudor = (p, ex = []) => saldo(asientos, p, ex);
	const acreedor = (p, ex = []) => -saldo(asientos, p, ex);
	const intangible = r2$1(deudor(["20"]) + deudor(["280"]));
	const material = r2$1(deudor(["21"]) + deudor(["281"]));
	const noCorriente = r2$1(intangible + material);
	const clientes = deudor(["43", "44"]);
	const hpDeudora = r2$1(deudor([
		"470",
		"472",
		"473"
	]));
	const tesoreria = deudor(["57"]);
	const socios = Math.max(0, deudor(["551"]));
	const corriente = r2$1(clientes + hpDeudora + tesoreria + socios);
	const totalActivo = r2$1(noCorriente + corriente);
	const capital = acreedor(["10"]);
	const reservas = acreedor(["11"]);
	const anteriores = acreedor(["12"], ["129"]);
	const resultadoAnt = acreedor(["129"]);
	const pn = r2$1(capital + reservas + anteriores + resultadoAnt + resultado);
	const lp = acreedor(["17"]);
	const cpFin = r2$1(acreedor(["52"]) + Math.max(0, acreedor(["551"])));
	const proveedores = acreedor(["40", "41"]);
	const otrosAcr = r2$1(acreedor([
		"465",
		"475",
		"476",
		"477"
	]));
	const pasivoCorriente = r2$1(cpFin + proveedores + otrosAcr);
	const totalPasivo = r2$1(pn + lp + pasivoCorriente);
	return {
		totalActivo,
		totalPasivo,
		diferencia: r2$1(totalActivo - totalPasivo),
		activo: [
			{
				codigo: "A",
				nombre: "ACTIVO NO CORRIENTE",
				importe: noCorriente,
				nivel: 0,
				total: true
			},
			{
				codigo: "I",
				nombre: "Inmovilizado intangible",
				importe: intangible,
				nivel: 1
			},
			{
				codigo: "II",
				nombre: "Inmovilizado material",
				importe: material,
				nivel: 1
			},
			{
				codigo: "B",
				nombre: "ACTIVO CORRIENTE",
				importe: corriente,
				nivel: 0,
				total: true
			},
			{
				codigo: "III",
				nombre: "Clientes y deudores comerciales",
				importe: clientes,
				nivel: 1
			},
			{
				codigo: "III",
				nombre: "Hacienda Pública deudora",
				importe: hpDeudora,
				nivel: 1
			},
			{
				codigo: "III",
				nombre: "Socios y administradores",
				importe: socios,
				nivel: 1
			},
			{
				codigo: "VI",
				nombre: "Efectivo y otros activos líquidos",
				importe: tesoreria,
				nivel: 1
			}
		],
		pasivo: [
			{
				codigo: "A",
				nombre: "PATRIMONIO NETO",
				importe: pn,
				nivel: 0,
				total: true
			},
			{
				codigo: "I",
				nombre: "Capital",
				importe: capital,
				nivel: 1
			},
			{
				codigo: "III",
				nombre: "Reservas",
				importe: reservas,
				nivel: 1
			},
			{
				codigo: "V",
				nombre: "Resultados de ejercicios anteriores",
				importe: r2$1(anteriores + resultadoAnt),
				nivel: 1
			},
			{
				codigo: "VII",
				nombre: "Resultado del ejercicio",
				importe: resultado,
				nivel: 1
			},
			{
				codigo: "B",
				nombre: "PASIVO NO CORRIENTE",
				importe: lp,
				nivel: 0,
				total: true
			},
			{
				codigo: "II",
				nombre: "Deudas a largo plazo",
				importe: lp,
				nivel: 1
			},
			{
				codigo: "C",
				nombre: "PASIVO CORRIENTE",
				importe: pasivoCorriente,
				nivel: 0,
				total: true
			},
			{
				codigo: "III",
				nombre: "Deudas a corto plazo",
				importe: cpFin,
				nivel: 1
			},
			{
				codigo: "V",
				nombre: "Proveedores y acreedores comerciales",
				importe: proveedores,
				nivel: 1
			},
			{
				codigo: "V",
				nombre: "Hacienda Pública, Seguridad Social y personal",
				importe: otrosAcr,
				nivel: 1
			}
		]
	};
}
// src/lib/vistaSocio.ts
/**
* Vista de socio: cifras de la empresa para socios e inversores.
* Lo calcula la Edge Function vista-socio (supabase/functions/vista-socio) con los datos completos,
* y al navegador solo llegan TOTALES: ninguna factura suelta, ninguna nómina de nadie.
* Quien ya tiene acceso a todo (titular, asesor) lo calcula en el propio navegador con esta misma función.
*/
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Las nóminas, en un total por mes: no queda ni el nombre ni el sueldo de nadie */
function agregarNominas(nominas) {
	const porMes = /* @__PURE__ */ new Map();
	for (const n of nominas) {
		if (n.estado !== "publicada") continue;
		const clave = `${n.anio}-${n.mes}`;
		const a = porMes.get(clave) ?? {
			id: clave,
			owner_id: "",
			trabajador_id: null,
			anio: n.anio,
			mes: n.mes,
			tipo: "mensual",
			estado: "publicada",
			file_path: "",
			nombre_leido: null,
			dni_leido: null,
			bruto: 0,
			neto: 0,
			irpf: 0,
			irpf_pct: null,
			ss_trabajador: 0,
			ss_empresa: 0,
			variables: 0,
			coste_total: 0,
			conceptos: null,
			ocr: null,
			publicada_at: null,
			created_at: "",
			trabajador_nombre: "plantilla"
		};
		a.bruto = r2(Number(a.bruto) + Number(n.bruto));
		a.neto = r2(Number(a.neto) + Number(n.neto));
		a.irpf = r2(Number(a.irpf) + Number(n.irpf));
		a.ss_trabajador = r2(Number(a.ss_trabajador) + Number(n.ss_trabajador));
		a.ss_empresa = r2(Number(a.ss_empresa) + Number(n.ss_empresa));
		a.coste_total = r2(Number(a.coste_total) + Number(n.coste_total));
		porMes.set(clave, a);
	}
	return [...porMes.values()];
}
/** La misma fecha un año antes (YYYY-MM-DD) */
function unAnioAntes(iso) {
	const anio = Number(iso.slice(0, 4)) - 1;
	const resto = iso.slice(4);
	if (resto === "-02-29" && !(anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0))) return `${anio}-02-28`;
	return `${anio}${resto}`;
}
function finDeMes(anio, mes) {
	return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}
const linea = (l, nombre) => l.find((x) => x.nombre === nombre)?.importe ?? 0;
function cifrasDe(asientos) {
	const pyg = perdidasYGanancias(asientos);
	const ventas = pyg.lineas.find((l) => l.codigo === "1")?.importe ?? 0;
	const gastos = -pyg.lineas.filter((l) => [
		"4",
		"6",
		"7",
		"8"
	].includes(l.codigo)).reduce((s, l) => s + l.importe, 0);
	const personal = -(pyg.lineas.find((l) => l.codigo === "6")?.importe ?? 0);
	return {
		pyg,
		ventas: r2(ventas),
		gastos: r2(gastos),
		resultado: pyg.resultado,
		personal: r2(personal)
	};
}
function calcularVistaSocio(datos, trabajadores, desde, hasta) {
	const { asientos } = generarAsientos({
		...datos,
		hasta
	});
	const anterior = {
		desde: unAnioAntes(desde),
		hasta: unAnioAntes(hasta)
	};
	const act = cifrasDe(entre(asientos, desde, hasta));
	const ant = cifrasDe(entre(asientos, anterior.desde, anterior.hasta));
	const anio = Number(hasta.slice(0, 4));
	const ultimoMes = Number(hasta.slice(5, 7));
	const meses = [];
	for (let m = 1; m <= ultimoMes; m++) {
		const mm = String(m).padStart(2, "0");
		const c = cifrasDe(entre(asientos, `${anio}-${mm}-01`, m === ultimoMes ? hasta : finDeMes(anio, m)));
		meses.push({
			mes: `${anio}-${mm}`,
			ventas: c.ventas,
			gastos: c.gastos,
			resultado: c.resultado
		});
	}
	const bal = balanceSituacion(entre(asientos, `${anio}-01-01`, hasta));
	return {
		desde,
		hasta,
		anterior,
		cifras: {
			ventas: act.ventas,
			gastos: act.gastos,
			resultado: act.resultado,
			margen: act.ventas ? r2(act.resultado / act.ventas * 100) / 100 : null,
			ventasAnt: ant.ventas,
			gastosAnt: ant.gastos,
			resultadoAnt: ant.resultado
		},
		meses,
		pyg: act.pyg.lineas.map((l, i) => ({
			...l,
			anterior: ant.pyg.lineas[i]?.importe ?? 0
		})),
		balance: {
			activo: bal.activo,
			pasivo: bal.pasivo,
			totalActivo: bal.totalActivo,
			totalPasivo: bal.totalPasivo,
			cuadra: Math.abs(bal.diferencia) < .01
		},
		liquidez: {
			tesoreria: linea(bal.activo, "Efectivo y otros activos líquidos"),
			pendienteCobro: linea(bal.activo, "Clientes y deudores comerciales"),
			pendientePago: linea(bal.pasivo, "Proveedores y acreedores comerciales"),
			administraciones: linea(bal.pasivo, "Hacienda Pública, Seguridad Social y personal"),
			haciendaDeudora: linea(bal.activo, "Hacienda Pública deudora")
		},
		plantilla: {
			trabajadores,
			costePersonal: act.personal,
			costePersonalAnt: ant.personal
		},
		calculado: (/* @__PURE__ */ new Date()).toISOString()
	};
}
// supabase/functions/vista-socio/fuente.ts
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
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
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
	if (!userData?.user) return json({ error: "Sesión no válida" }, 401);
	let body;
	try {
		body = await req.json();
	} catch {
		return json({ error: "Petición no válida" }, 400);
	}
	const { cuenta_id, desde, hasta } = body;
	if (!cuenta_id || !desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return json({ error: "Indica la empresa y un periodo válido" }, 400);
	const { data: puede, error: ePuede } = await asUser.rpc("puede", {
		cuenta: cuenta_id,
		modulo: "socio"
	});
	if (ePuede) return json({ error: "No se ha podido comprobar el acceso" }, 500);
	if (!puede) return json({ error: "No tienes acceso a la vista de socio de esta empresa" }, 403);
	const admin = createClient(url, secreta, { auth: {
		autoRefreshToken: false,
		persistSession: false
	} });
	const [f, g, n, t, m, i] = await Promise.all([
		admin.from("invoices").select("*").eq("owner_id", cuenta_id).neq("estado", "borrador"),
		admin.from("expenses").select("*").eq("owner_id", cuenta_id).eq("estado", "revisado"),
		admin.from("nominas").select("anio, mes, estado, bruto, neto, irpf, ss_trabajador, ss_empresa, coste_total").eq("owner_id", cuenta_id).eq("estado", "publicada"),
		admin.from("trabajadores").select("id", {
			count: "exact",
			head: true
		}).eq("owner_id", cuenta_id).eq("estado", "alta"),
		admin.from("asientos_manuales").select("*").eq("owner_id", cuenta_id),
		admin.from("inmovilizados").select("*").eq("owner_id", cuenta_id)
	]);
	const error = [
		f,
		g,
		n,
		t,
		m,
		i
	].find((r) => r.error)?.error;
	if (error) {
		console.error("vista-socio", error);
		return json({ error: "No se han podido leer los datos" }, 500);
	}
	const vista = calcularVistaSocio({
		facturas: f.data ?? [],
		gastos: g.data ?? [],
		nominas: agregarNominas(n.data ?? []),
		manuales: m.data ?? [],
		inmovilizados: i.data ?? []
	}, t.count ?? 0, desde, hasta);
	return json(vista);
});
