import { parentPort } from 'node:worker_threads'
import { errorMessage } from '../../core/errors'
import { htmlToCsv, htmlToExcel } from '../../core/conversion/html'
import { readImageInfo, renderImage, replaceRegion, type ImageRenderOptions } from '../../core/image/process'
import { recognizeImage } from '../../core/image/ocr'
import * as pdf from '../../core/pdf/engine'

interface JobMessage {
  id: string
  type: string
  payload: Record<string, unknown>
}

parentPort?.on('message', (message: JobMessage) => {
  void run(message)
})

async function run(message: JobMessage): Promise<void> {
  try {
    const result = await dispatch(message.type, message.payload)
    parentPort?.postMessage({ id: message.id, ok: true, result })
  } catch (error) {
    parentPort?.postMessage({ id: message.id, ok: false, error: errorMessage(error) })
  }
}

async function dispatch(type: string, payload: Record<string, unknown>): Promise<unknown> {
  const bytes = payload.bytes instanceof Uint8Array ? payload.bytes : toBytes(payload.bytes)
  switch (type) {
    case 'html-excel':
      return htmlToExcel.convert(String(payload.html ?? ''), { includeHidden: Boolean(payload.includeHidden) })
    case 'html-csv':
      return htmlToCsv.convert(String(payload.html ?? ''), {
        includeHidden: Boolean(payload.includeHidden),
        delimiter: payload.delimiter === ';' || payload.delimiter === '\t' ? payload.delimiter : ',',
        bom: payload.bom !== false
      })
    case 'image-info':
      return readImageInfo(Buffer.from(bytes))
    case 'image-render':
      return renderImage(Buffer.from(bytes), payload.options as ImageRenderOptions).then((result) => ({
        bytes: new Uint8Array(result.bytes),
        warning: result.warning
      }))
    case 'image-ocr':
      return recognizeImage(Buffer.from(bytes))
    case 'image-replace':
      return new Uint8Array(
        await replaceRegion(
          Buffer.from(bytes),
          payload.region as { x: number; y: number; width: number; height: number },
          payload.style as { text: string; fontSize: number; color: string; background: string }
        )
      )
    case 'pdf':
      return pdfDispatch(String(payload.op ?? ''), bytes, payload)
    default:
      throw new Error(`Unknown job ${type}`)
  }
}

async function pdfDispatch(op: string, bytes: Uint8Array, payload: Record<string, unknown>): Promise<unknown> {
  const page = Number(payload.page ?? 0)
  switch (op) {
    case 'inspect':
      return pdf.inspectPdf(bytes)
    case 'text':
      return pdf.extractPdfText(bytes)
    case 'rotate':
      return pdf.rotatePage(bytes, page, Number(payload.delta ?? 90))
    case 'delete':
      return pdf.deletePage(bytes, page)
    case 'duplicate':
      return pdf.duplicatePage(bytes, page)
    case 'move':
      return pdf.movePage(bytes, Number(payload.from ?? 0), Number(payload.to ?? 0))
    case 'blank':
      return pdf.addBlankPage(bytes, Number(payload.at ?? 0))
    case 'extract':
      return pdf.extractPages(bytes, (payload.indices as number[]) ?? [page])
    case 'merge':
      return pdf.mergePdfs([bytes, ...((payload.others as Uint8Array[]) ?? []).map((part) => toBytes(part))])
    case 'metadata':
      return pdf.setMetadata(bytes, { title: String(payload.title ?? ''), author: String(payload.author ?? '') })
    case 'text-add':
      return pdf.addText(bytes, page, String(payload.text ?? ''), payload.rect as pdf.PdfRect, Number(payload.size ?? 16))
    case 'overlay': {
      const result = await pdf.addOverlayText(bytes, page, String(payload.text ?? ''), payload.rect as pdf.PdfRect, Number(payload.size ?? 16))
      return result
    }
    case 'square':
      return pdf.addSquareAnnotation(bytes, page, payload.rect as pdf.PdfRect)
    case 'note':
      return pdf.addNoteAnnotation(bytes, page, payload.rect as pdf.PdfRect, String(payload.contents ?? ''))
    case 'highlight':
      return pdf.addHighlightAnnotation(bytes, page, payload.rect as pdf.PdfRect)
    case 'ink':
      return pdf.addInkAnnotation(bytes, page, (payload.points as Array<[number, number]>) ?? [])
    case 'annots':
      return pdf.annotationSubtypes(bytes, page)
    case 'fields':
      return pdf.listFormFields(bytes)
    case 'fill':
      return pdf.fillForm(bytes, (payload.values as Record<string, string | boolean>) ?? {})
    case 'flatten':
      return pdf.flattenForm(bytes)
    case 'plan-redact':
      return pdf.planRedaction(bytes, page, String(payload.needle ?? ''))
    case 'redact':
      return pdf.redactText(bytes, page, String(payload.needle ?? ''))
    case 'replace-literal':
      return pdf.replaceLiteralText(bytes, page, String(payload.needle ?? ''), String(payload.replacement ?? ''))
    default:
      throw new Error(`Unknown PDF operation ${op}`)
  }
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value)) return Uint8Array.from(value)
  if (value && typeof value === 'object' && 'data' in value && Array.isArray((value as { data: number[] }).data)) {
    return Uint8Array.from((value as { data: number[] }).data)
  }
  return new Uint8Array()
}
