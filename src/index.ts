import axios from "axios";
import "dotenv/config";
import fs from 'fs';
import path from "path";
import { Telegraf } from "telegraf";
import { extraerTotal, leerTextoImagen } from "./ocr";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("Falta BOT_TOKEN en .env");
}


type EstadoUsuario = {
  esperandoTotalManual?: boolean
  esperandoCategoria?: boolean
  imagenPath?: string
  total?: number
}

const estados = new Map<number, EstadoUsuario>()

const bot = new Telegraf(BOT_TOKEN);

const IMAGES_DIR = path.resolve('images')
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR)
}

bot.start((ctx) => {
  ctx.reply('Bot activo 🤖 Envíame una boleta')
})

bot.on('photo', async (ctx) => {
  try {
    const photos = ctx.message.photo
    const photo = photos[photos.length - 1] // mayor resolución
    const fileId = photo.file_id

    const fileLink = await ctx.telegram.getFileLink(fileId)

    const filePath = path.join(
      IMAGES_DIR,
      `boleta_${Date.now()}.jpg`
    )

    const response = await axios.get(fileLink.href, {
      responseType: 'stream'
    })

    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)

writer.on('finish', async () => {
  await ctx.reply('🔍 Leyendo boleta...')

  const texto = await leerTextoImagen(filePath)
  console.log('OCR:', texto)

  const total = extraerTotal(texto)

if (total) {
  await ctx.reply(`💰 Total detectado: $${total}`)
} else {
  estados.set(ctx.from.id, {
    esperandoTotalManual: true,
    imagenPath: filePath
  })

  await ctx.reply(
    '❌ No pude detectar el total.\n' +
    '✍️ Escribe el monto manualmente (ej: 12450)'
  )
}
})

  } catch (error) {
    console.error(error)
    ctx.reply('❌ Error procesando la imagen')
  }
})

bot.on('text', async (ctx) => {
  const estado = estados.get(ctx.from.id)
  if (!estado?.esperandoTotalManual) return

  const texto = ctx.message.text
  const numero = texto
    .replace(/\./g, '')
    .replace(',', '.')

  const total = parseFloat(numero)

  if (isNaN(total)) {
    await ctx.reply('❌ No entendí el monto, intenta otra vez')
    return
  }

  estados.delete(ctx.from.id)

  await ctx.reply(`💰 Total ingresado: $${total}`)
})

bot.launch()
  .then(() => console.log("🤖 Bot iniciado en local"))
  .catch((err) => console.error("Error iniciando bot", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

