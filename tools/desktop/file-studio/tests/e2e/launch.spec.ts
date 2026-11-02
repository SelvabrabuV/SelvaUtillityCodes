import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'

test('launches the home screen', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '../../out/main/index.js')],
    env: { ...process.env, FILE_STUDIO_E2E: '1' }
  })
  const page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: 'Open a file and work on it offline.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'HTML tables' })).toBeVisible()
  await app.close()
})
