import { Client } from "@notionhq/client";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  throw new Error("Falta BOT_TOKEN en .env");
}

const notion = new Client({
  auth: NOTION_TOKEN,
});

const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
if (!DATABASE_ID) {
  throw new Error("Falta NOTION_DATABASE_ID");
}

type CrearGastoInput = {
  nombre: string;
  monto: number;
  categoria: string;
  tarjeta?: string;
  origen: string;
};

export async function crearGastoEnNotion({
  nombre,
  monto,
  categoria,
  tarjeta,
  origen,
}: CrearGastoInput) {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Nombre: {
        title: [{ text: { content: nombre } }],
      },
      Monto: {
        number: monto,
      },
      Categoría: {
        select: { name: categoria },
      },
      Fecha: {
        date: { start: new Date().toISOString() },
      },
      Origen: {
        select: { name: origen },
      },
      Tarjeta: {
        select: { name: tarjeta ?? "N/A" },
      },
    },
  });
}