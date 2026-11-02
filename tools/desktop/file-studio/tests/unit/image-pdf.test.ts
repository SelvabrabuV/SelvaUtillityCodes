import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { neutralAdjustments, readImageInfo, renderImage, replaceRegion } from '../../src/core/image/process'
import { createProject, parseProject, stringifyProject } from '../../src/core/image/project'
import {
  addHighlightAnnotation,
  addNoteAnnotation,
  addSquareAnnotation,
  addText,
  annotationSubtypes,
  deletePage,
  extractPdfText,
  fillForm,
  inspectPdf,
  listFormFields,
  mergePdfs,
  planRedaction,
  redactText,
  replaceLiteralText,
  rotatePage,
  streamsContain
} from '../../src/core/pdf/engine'

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('SECRET-TOKEN', { x: 40, y: 300, size: 18, font, color: rgb(0, 0, 0) })
  page.drawText('Public', { x: 40, y: 260, size: 18, font, color: rgb(0, 0, 0) })
  doc.addPage([400, 400])
  return doc.save()
}

describe('images', () => {
  it('rotates, converts, and leaves pixels outside a replacement region', async () => {
    const source = await sharp({
      create: { width: 30, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
      .png()
      .toBuffer()
    const info = await readImageInfo(source)
    expect(info.format).toBe('png')
    expect(info.warning).toBeUndefined()
    const rendered = await renderImage(source, {
      rotate: 90,
      format: 'webp',
      quality: 0.8,
      adjustments: { ...neutralAdjustments, contrast: 1.1 }
    })
    expect(rendered.bytes.subarray(0, 4).toString('ascii')).not.toBe('')
    const webp = await readImageInfo(rendered.bytes)
    expect(webp.format).toBe('webp')
    expect(webp.width).toBe(20)
    const edited = await replaceRegion(source, { x: 8, y: 4, width: 12, height: 10 }, {
      text: 'A',
      fontSize: 8,
      color: '#ffffff',
      background: '#000000'
    })
    const before = await sharp(source).raw().toBuffer()
    const after = await sharp(edited).ensureAlpha().removeAlpha().raw().toBuffer()
    expect(before[0]).toBe(after[0])
    expect(before[1]).toBe(after[1])
    const project = createProject(30, 20, { mime: 'image/png', dataBase64: source.toString('base64') })
    project.layers.push({
      id: 'text-1',
      type: 'text',
      name: 'Label',
      visible: true,
      locked: false,
      fabric: { text: 'Ada' }
    })
    const reopened = parseProject(stringifyProject(project))
    expect(reopened.layers).toHaveLength(2)
    expect(reopened.source?.dataBase64).toBe(project.source?.dataBase64)
  })
})

describe('pdf engine', () => {
  it('manages pages, annotations, and new text', async () => {
    let bytes = await samplePdf()
    expect((await inspectPdf(bytes)).pageCount).toBe(2)
    bytes = await rotatePage(bytes, 0, 90)
    expect((await inspectPdf(bytes)).pages[0].rotation).toBe(90)
    bytes = await addText(bytes, 1, 'Added', { x: 40, y: 100, width: 80, height: 20 })
    bytes = await addSquareAnnotation(bytes, 0, { x: 20, y: 20, width: 40, height: 20 })
    bytes = await addNoteAnnotation(bytes, 0, { x: 70, y: 20, width: 24, height: 24 }, 'Note')
    bytes = await addHighlightAnnotation(bytes, 0, { x: 40, y: 290, width: 120, height: 20 })
    expect(await annotationSubtypes(bytes, 0)).toEqual(expect.arrayContaining(['Square', 'Text', 'Highlight']))
    const text = await extractPdfText(bytes)
    expect(text[1].text).toContain('Added')
    const merged = await mergePdfs([bytes, bytes])
    expect((await inspectPdf(merged)).pageCount).toBe(4)
    const trimmed = await deletePage(merged, 0)
    expect((await inspectPdf(trimmed)).pageCount).toBe(3)
  })

  it('removes literal text and refuses image pages', async () => {
    const bytes = await samplePdf()
    const plan = await planRedaction(bytes, 0, 'SECRET-TOKEN')
    expect(plan.canApply).toBe(true)
    const redacted = await redactText(bytes, 0, 'SECRET-TOKEN')
    const text = (await extractPdfText(redacted)).map((page) => page.text).join('\n')
    expect(text).not.toContain('SECRET-TOKEN')
    expect(text).toContain('Public')
    expect(await streamsContain(redacted, 'SECRET-TOKEN')).toBe(false)
    const replaced = await replaceLiteralText(bytes, 0, 'SECRET-TOKEN', 'REDACTED')
    expect(replaced.mode === 'content-stream' || replaced.mode === 'unsupported').toBe(true)
    if (replaced.mode === 'content-stream') {
      const updated = (await extractPdfText(replaced.bytes)).map((page) => page.text).join('\n')
      expect(updated).toContain('REDACTED')
      expect(updated).not.toContain('SECRET-TOKEN')
    }
    const pictured = await PDFDocument.create()
    const picturedPage = pictured.addPage([200, 200])
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 8, b: 7 } } }).png().toBuffer()
    picturedPage.drawImage(await pictured.embedPng(png), { x: 10, y: 10, width: 4, height: 4 })
    const picturedFont = await pictured.embedFont(StandardFonts.Helvetica)
    picturedPage.drawText('SECRET-TOKEN', { x: 20, y: 40, size: 12, font: picturedFont })
    const picturedBytes = await pictured.save()
    const blocked = await planRedaction(picturedBytes, 0, 'SECRET-TOKEN')
    expect(blocked.canApply).toBe(false)
    expect(blocked.mode).toBe('blocked')
  })

  it('fills a form field and reads it back', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    const form = doc.getForm()
    const field = form.createTextField('customer')
    field.addToPage(page, { x: 50, y: 500, width: 200, height: 24 })
    field.setText('Ada')
    const bytes = await doc.save()
    const filled = await fillForm(bytes, { customer: 'Grace' })
    const fields = await listFormFields(filled)
    expect(fields.find((item) => item.name === 'customer')?.value).toBe('Grace')
  })
})
