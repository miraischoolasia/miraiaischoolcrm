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

  it("calls the yearly membership the Mirai Club for Mirai and its own name for another brand", async () => {
    expect((await loadBrand()).clubName).toBe('Mirai Club')
    vi.stubEnv('VITE_BRAND_NAME', 'Other School')
    expect((await loadBrand()).clubName).toBe('Membership')
    vi.stubEnv('VITE_BRAND_CLUB_NAME', 'Parent Pass')
    expect((await loadBrand()).clubName).toBe('Parent Pass')
  })

  it("has no tab icon of Mirai's for another brand: its own picture, its logo, or none", async () => {
    expect((await loadBrand()).favicon).toBeNull()
    vi.stubEnv('VITE_BRAND_NAME', 'Other School')
    expect((await loadBrand()).favicon).toBeNull()
    vi.stubEnv('VITE_BRAND_LOGO_URL', 'https://example.com/logo.png')
    expect((await loadBrand()).favicon).toBe('https://example.com/logo.png')
    vi.stubEnv('VITE_BRAND_FAVICON_URL', 'https://example.com/icon.png')
    expect((await loadBrand()).favicon).toBe('https://example.com/icon.png')
  })

  it('uses the logo address when one is given', async () => {
    vi.stubEnv('VITE_BRAND_NAME', 'Other School')
    vi.stubEnv('VITE_BRAND_LOGO_URL', 'https://example.com/logo.png')
    const brand = await loadBrand()
    expect(brand.logo).toBe('https://example.com/logo.png')
  })
})
