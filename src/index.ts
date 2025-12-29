import axios from "axios";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Telegraf } from "telegraf";
import { crearGastoEnNotion } from "./notion";
import { extraerTotal, leerTextoImagen } from "./ocr";
import {
  extraerMovimientosNotificacion,
  manejarIngresoManual,
  Movimiento,
  tecladoCategorias,
} from "./utils";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("Falta BOT_TOKEN en .env");
}

function esNotificacionBancaria(texto: string): boolean {
  return (
    /google wallet/i.test(texto) || /with\s+(mastercard|visa)/i.test(texto)
  );
}

type EstadoUsuario =
  | {
      modo: "boleta";
      total?: number;
      esperandoTotalManual?: boolean;
      esperandoCategoria?: boolean;
    }
  | {
      modo: "notificaciones";
      movimientos: Movimiento[];
      indiceActual: number;
      esperandoCategoria: boolean;
    };

const estados = new Map<number, EstadoUsuario>();

const bot = new Telegraf(BOT_TOKEN);

const IMAGES_DIR = path.resolve("images");
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR);
}

bot.start((ctx) => {
  ctx.reply("Bot activo 🤖 Envíame una boleta");
});

bot.on("photo", async (ctx) => {
  try {
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; 
    const fileId = photo.file_id;

    const fileLink = await ctx.telegram.getFileLink(fileId);

    const filePath = path.join(IMAGES_DIR, `boleta_${Date.now()}.jpg`);

    const response = await axios.get(fileLink.href, {
      responseType: "stream",
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    writer.on("finish", async () => {
      await ctx.reply("🔍 Leyendo boleta...");

      const texto = await leerTextoImagen(filePath);
      console.log("OCR:", texto);

      const movimientos = extraerMovimientosNotificacion(texto);

      if (esNotificacionBancaria(texto) && movimientos.length >= 1) {
        estados.set(ctx.from.id, {
          modo: "notificaciones",
          movimientos,
          indiceActual: 0,
          esperandoCategoria: true,
        });

        await mostrarMovimientoActual(ctx);
        return;
      }

      const total = extraerTotal(texto);

      if (total) {
        estados.set(ctx.from.id, {
          modo: "boleta",
          total,
          esperandoCategoria: true,
        });

        await ctx.reply(`💰 Total detectado: $${total}`);
        await preguntarCategoria(ctx);
        return;
      } else {
        estados.set(ctx.from.id, {
          modo: "boleta",
          esperandoTotalManual: true,
        });

        await ctx.reply(
          "❌ No pude detectar el total.\n" +
            "✍️ Escribe el monto manualmente (ej: 12450)"
        );
      }
    });
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Error procesando la imagen");
  }
});

async function mostrarMovimientoActual(ctx: any) {
  const estado = estados.get(ctx.from.id);

  if (!estado || estado.modo !== "notificaciones") return;

  const mov = estado.movimientos[estado.indiceActual];

  await ctx.reply(
    `💰 *${mov.comercio}*\n` +
      `Monto: $${mov.monto}\n` +
      `Tarjeta: ${mov.tarjeta}\n\n` +
      `Selecciona categoría`,
    {
      parse_mode: "Markdown",
      ...tecladoCategorias(),
    }
  );
}

bot.hears(/^\d+[.,]?\d*$/, async (ctx) => {
  const estado = estados.get(ctx.from.id);
  if (!estado || estado.modo !== "boleta") return;
  if (!estado.esperandoTotalManual) return;

  const texto = ctx.message.text;
  const numero = texto.replace(/\./g, "").replace(",", ".");

  const total = parseFloat(numero);

  if (isNaN(total)) {
    await ctx.reply("❌ No entendí el monto, intenta otra vez");
    return;
  }

  estados.set(ctx.from.id, {
    modo: "boleta",
    total,
    esperandoCategoria: true,
  });

  await ctx.reply(`💰 Total ingresado: $${total}`);
  await preguntarCategoria(ctx);
});

bot.action(/cat_(.+)/, async (ctx) => {
  const categoria = ctx.match[1];
  const userId = ctx.from.id;
  const estado = estados.get(userId);

  if (!estado) {
    await ctx.answerCbQuery();
    return;
  }

  // 🧾 FLUJO BOLETA (1 gasto)
  if (estado.modo === "boleta") {
    if (!estado.total) {
      await ctx.answerCbQuery("❌ Falta el total");
      return;
    }

    await crearGastoEnNotion({
      nombre: "Gasto",
      monto: estado.total,
      categoria,
      origen: "Boleta",
    });

    estados.delete(userId);

    await ctx.editMessageText(
      `✅ Gasto guardado\n💰 $${estado.total}\n📂 ${categoria}`
    );

    await ctx.answerCbQuery();
    return;
  }

  if (estado.modo === "notificaciones") {
    const mov = estado.movimientos[estado.indiceActual];

    await crearGastoEnNotion({
      nombre: mov.comercio,
      monto: mov.monto,
      categoria,
      tarjeta: mov.tarjeta,
      origen: "Notificación bancaria",
    });

    estado.indiceActual++;

    if (estado.indiceActual >= estado.movimientos.length) {
      estados.delete(userId);

      await ctx.editMessageText("✅ Todos los gastos fueron guardados");
    } else {
      await ctx.answerCbQuery("Guardado");
      await mostrarMovimientoActual(ctx);
    }

    return;
  }

  await ctx.answerCbQuery();
});

bot.command("cancel", async (ctx) => {
  const id = ctx.from.id;

  if (!estados.has(id)) {
    await ctx.reply("ℹ️ No hay ningún proceso activo para cancelar");
    return;
  }

  estados.delete(id);
  await ctx.reply("❌ Proceso cancelado. Puedes enviar una nueva boleta 📸");
});

bot.command("status", async (ctx) => {
  const estado = estados.get(ctx.from.id);

  if (!estado) {
    await ctx.reply("🟢 No hay ningún proceso activo");
    return;
  }

  const lineas: string[] = ["📋 *Estado actual:*"];

  if (estado.modo === "boleta") {
    lineas.push("🧾 Modo: Boleta");

    if (estado.total !== undefined) {
      lineas.push(`💰 Total: $${estado.total}`);
    }

    if (estado.esperandoTotalManual) {
      lineas.push("⌨️ Esperando ingreso manual del total");
    }

    if (estado.esperandoCategoria) {
      lineas.push("📂 Esperando selección de categoría");
    }
  }

  if (estado.modo === "notificaciones") {
    lineas.push("📱 Modo: Notificaciones bancarias");
    lineas.push(
      `➡️ Gasto ${estado.indiceActual + 1} de ${estado.movimientos.length}`
    );
    lineas.push("📂 Esperando selección de categoría");
  }

  await ctx.reply(lineas.join("\n"), { parse_mode: "Markdown" });
});

bot.command("i",  manejarIngresoManual);
bot.command("im",  manejarIngresoManual);
bot.command("ingreso",  manejarIngresoManual);
bot.command("ingresoManual",  manejarIngresoManual);


function preguntarCategoria(ctx: any) {
  return ctx.reply("📂 Selecciona el tipo de gasto", tecladoCategorias());
}

bot
  .launch()
  .then(() => console.log("🤖 Bot iniciado en local"))
  .catch((err) => console.error("Error iniciando bot", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
