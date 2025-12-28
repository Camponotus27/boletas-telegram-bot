import Tesseract from 'tesseract.js'

export async function leerTextoImagen(imagePath: string): Promise<string> {
  const result = await Tesseract.recognize(
    imagePath,
    'spa', // español
    {
      logger: () => {} // silenciamos logs
    }
  )

  return result.data.text
}

export function extraerTotal(texto: string): number | null {
  const lineas = texto.split('\n').map(l => l.trim())

  for (const linea of lineas) {
    const match = linea.match(
      /(total|TOTAL|Total)\s*[:$]?\s*([\d.,]+)/i
    )

    if (match) {
      const numero = match[2]
        .replace(/\./g, '')
        .replace(',', '.')

      const total = parseFloat(numero)
      if (!isNaN(total)) return total
    }
  }

  return null
}