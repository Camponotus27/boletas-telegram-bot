import fs from "fs";
import path from "path";
import { Markup } from "telegraf";
import { CATEGORIAS, MAP_CATEGORIAS, MAP_TARJETAS } from "./constantes.js";
import { crearGastoEnNotion } from "./notion.js";

export function tecladoCategorias() {
  return Markup.inlineKeyboard(
    CATEGORIAS.map((c) => [Markup.button.callback(c.label, `cat_${c.key}`)])
  );
}

export type Movimiento = {
  comercio: string;
  monto: number;
  tarjeta: string;
};

export function esNotificacionWallet(texto: string): boolean {
  return (
    /google wallet/i.test(texto) || /with\s+(mastercard|visa)/i.test(texto)
  );
}

export function esNotificacionFalabella(texto: string): boolean {
  const t = texto.toLowerCase();

  let coincidencias = 0;

  if (t.includes("banco falabella")) coincidencias++;
  if (t.includes("compraste $")) coincidencias++;
  if (t.includes("con tu cmr")) coincidencias++;
  if (t.includes("mastercard")) coincidencias++;
  if (t.includes("terminada en")) coincidencias++;

  return coincidencias >= 2;
}

export function extraerMovimientosNotificacion(texto: string): Movimiento[] {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const movimientos: Movimiento[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const montoMatch = lineas[i].match(/CLP[^\d]*([\d.,]+)/i);
    if (!montoMatch) continue;

    const monto = parseInt(montoMatch[1].replace(/\./g, "").replace(",", ""));

    const tarjetaMatch = lineas[i].match(/with\s*(.+)/i);
    const tarjeta = tarjetaMatch
      ? tarjetaMatch[1]
          .replace(/[+=\-]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : "Desconocida";

    let comercio = "Gasto sin nombre";
    for (let j = i - 1; j >= 0; j--) {
      const l = lineas[j];
      if (
        l === l.toUpperCase() &&
        !l.includes("CLP") &&
        l.length > 4 &&
        !/^\d{1,2}:\d{2}$/.test(l)
      ) {
        comercio = l.replace(/^[^A-Z]+/, "").trim();
        break;
      }
    }

    movimientos.push({ comercio, monto, tarjeta });
  }

  return movimientos;
}

export async function manejarIngresoManual(ctx: any) {
  const texto = ctx.message.text;

  // Quitar el comando
  const lineas = texto
    .replace(/^\/\w+/, "")
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean);

  if (lineas.length < 2) {
    await ctx.reply(
      "❌ Formato incorrecto.\n\n" +
        "Usa:\n" +
        "/ingresoManual\n" +
        "Descripción\n" +
        "Monto\n" +
        "[Categoría opcional]\n" +
        "[Tarjeta opcional]"
    );
    return;
  }

  const descripcion = lineas[0];

  const monto = parseInt(lineas[1].replace(/\./g, "").replace(",", ""));

  if (isNaN(monto)) {
    await ctx.reply("❌ El monto no es válido");
    return;
  }

  // Defaults
  let categoria = "otro";
  let tarjeta = "CMR";

  console.log("lineas", lineas);
  if (lineas[2]) {
    const catKey = lineas[2].toLowerCase();
    categoria = MAP_CATEGORIAS[catKey] ?? "otro";
  }

  if (lineas[3]) {
    const tarKey = lineas[3].toLowerCase();
    console.log("tarKey", tarKey);
    tarjeta = MAP_TARJETAS[tarKey] ?? "CMR";
  }

  await crearGastoEnNotion({
    nombre: descripcion,
    monto,
    categoria,
    tarjeta,
    origen: "ingresoManual",
  });

  await ctx.reply(
    "✅ Gasto ingresado\n\n" +
      `📝 ${descripcion}\n` +
      `💰 $${monto}\n` +
      `📂 ${categoria}\n` +
      `💳 ${tarjeta}`
  );
}

export function limpiarImagenesAntiguas(dir: string, max: number) {
  if (!fs.existsSync(dir)) return;

  const archivos = fs
    .readdirSync(dir)
    .map((name) => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      return { name, fullPath, time: stat.mtimeMs };
    })
    // más antiguas primero
    .sort((a, b) => a.time - b.time);

  if (archivos.length <= max) return;

  const aEliminar = archivos.slice(0, archivos.length - max);

  for (const file of aEliminar) {
    try {
      fs.unlinkSync(file.fullPath);
      console.log("🗑️ Imagen eliminada:", file.name);
    } catch (err) {
      console.error("Error eliminando imagen:", file.name, err);
    }
  }
}

export function extraerMovimientosFalabella(texto: string): Movimiento[] {
  const movimientos: Movimiento[] = [];

  const montoMatch = texto.match(/\$([\d.]+)/);
  if (!montoMatch) return movimientos;

  const monto = parseInt(montoMatch[1].replace(/\./g, ""));

  const comercioMatch = texto.match(/en\s+([A-Z0-9 .]+)/);
  const comercio = comercioMatch ? comercioMatch[1].trim() : "Gasto sin nombre";

  movimientos.push({
    comercio,
    monto,
    tarjeta: "Mastercard 3009",
  });

  return movimientos;
}
