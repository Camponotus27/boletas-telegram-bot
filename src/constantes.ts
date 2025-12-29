export const CATEGORIAS = [
  { key: "comida", label: "🍔 Comida" },
  { key: "super", label: "🛒 Supermercado" },
  { key: "salud", label: "🏥 Salud" },
  { key: "perritos", label: "🐕 Perritos" },
  { key: "auto", label: "🚗 Auto" },
  { key: "willy", label: "👤 Willy" },
  { key: "vestuario", label: "👗 Vestuario" },
  { key: "otro", label: "📦 Otro" },
];


export const MAP_CATEGORIAS: Record<string, string> = {
  comida: "comida",
  super: "super",
  supermercado: "super",
  salud: "salud",
  perritos: "perritos",
  perro: "perritos",
  auto: "auto",
  willy: "willy",
  vestuario: "vestuario",
  otro: "otro",
};

const CMR = "Mastercard 3009"
const DebitoSandander = "Pendiente Santander"
const LiderBCI = "Mastercard 0000"

export  const MAP_TARJETAS: Record<string, string> = {
  cmr: CMR,
  falabella: CMR,
  "mastercard 3009": CMR,
  "3009": CMR,
  santander: DebitoSandander,
  sant: DebitoSandander,
  debito: DebitoSandander,
  lider: LiderBCI,
  líder: LiderBCI
};
