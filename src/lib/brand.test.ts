import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadBrand() {
  vi.resetModules()
  return (await import('./brand')).brand
}

describe('brand', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is Mirai when nothing is set', async () => {
    const brand = await loadBrand()
    expect(brand.name).toBe('Mirai AI School')
    expect(brand.company).toBe('EGENIUS SDN. BHD.')
    expect(brand.logo).toBeTruthy()
    expect(brand.usesMiraiArt).toBe(true)
  })

  it('takes the name and company of another brand, with no Mirai logo or art', async () => {
    vi.stubEnv('VITE_BRAND_NAME', '  英雄教育CRM ')
    vi.stubEnv('VITE_BRAND_COMPANY', 'Eduhero Sdn. Bhd.')
    const brand = await loadBrand()
    expect(brand.name).toBe('英雄教育CRM')
    expect(brand.company).toBe('Eduhero Sdn. Bhd.')
    expect(brand.logo).toBeNull()
    expect(brand.usesMiraiArt).toBe(false)
  })

  it('uses the logo address when one is given', async () => {
    vi.stubEnv('VITE_BRAND_NAME', 'Other School')
    vi.stubEnv('VITE_BRAND_LOGO_URL', 'https://example.com/logo.png')
    const brand = await loadBrand()
    expect(brand.logo).toBe('https://example.com/logo.png')
  })
})
