// Inspección visual automatizada del SaaS IsoSmartCore
// Uso:
//   node inspection/inspect.mjs                 -> modo público (landing/login)
//   node inspection/inspect.mjs <email> <pass>  -> modo logueado (recorre el menú entero)

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:5173'
const OUT = join(process.cwd(), 'inspection', 'out')
mkdirSync(OUT, { recursive: true })

const [, , email, password] = process.argv
const logueado = !!(email && password)

const report = {
  startedAt: new Date().toISOString(),
  mode: logueado ? 'authenticated' : 'public',
  consoleErrors: [],
  consoleWarnings: [],
  networkFailures: [],
  pageErrors: [],
  routes: [],
  scrollTest: null,
  perf: {}
}

function attachListeners(page, routeLabel) {
  page.on('console', msg => {
    const t = msg.type()
    if (t === 'error') report.consoleErrors.push({ route: routeLabel, text: msg.text() })
    else if (t === 'warning') report.consoleWarnings.push({ route: routeLabel, text: msg.text() })
  })
  page.on('pageerror', err => {
    report.pageErrors.push({ route: routeLabel, message: err.message, stack: err.stack })
  })
  page.on('response', resp => {
    const status = resp.status()
    if (status >= 400) {
      report.networkFailures.push({ route: routeLabel, url: resp.url(), status })
    }
  })
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  return path
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  attachListeners(page, 'landing')

  // 1) Landing
  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  report.perf.landingMs = Date.now() - t0
  await shot(page, '01-landing')
  report.routes.push({ name: 'landing', screenshot: '01-landing.png', loadMs: report.perf.landingMs })

  if (!logueado) {
    // Detectar si hay form de login y describir
    const hasEmail = await page.locator('input[type="email"]').count()
    const hasPass = await page.locator('input[type="password"]').count()
    report.loginForm = { emailInputs: hasEmail, passInputs: hasPass }
    await browser.close()
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    console.log('[OK] Inspección pública lista.')
    console.log('Para inspección logueada: node inspection/inspect.mjs <email> <password>')
    return
  }

  // 2) Login
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await shot(page, '02-login-filled')
  await page.click('button[type="submit"]')

  // Esperar que entre al shell (presencia del nav-menu o cambio de URL)
  try {
    await page.waitForSelector('.nav-menu, nav', { timeout: 15000 })
  } catch (e) {
    report.pageErrors.push({ route: 'login', message: 'No apareció nav-menu tras login' })
    await shot(page, '02b-login-failed')
    await browser.close()
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    return
  }
  await shot(page, '03-shell-after-login')

  // 3) Recorrer todos los items del menú
  const navButtons = await page.$$('.nav-menu button')
  report.menuItemCount = navButtons.length

  // Listar los labels
  const labels = []
  for (const b of navButtons) {
    const txt = (await b.innerText()).trim().replace(/\s+/g, ' ')
    labels.push(txt)
  }
  report.menuLabels = labels

  // Expandir grupos colapsados primero (heurística: items que solo tienen título y chevron)
  // Mejor: click en cada uno y capturar.
  for (let i = 0; i < navButtons.length; i++) {
    const label = labels[i] || `item-${i}`
    const safe = label.replace(/[^\w]+/g, '_').slice(0, 40)
    const tStart = Date.now()
    try {
      const fresh = await page.$$('.nav-menu button')
      await fresh[i].click()
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
      const loadMs = Date.now() - tStart
      await shot(page, `route-${String(i).padStart(2, '0')}-${safe}`)
      report.routes.push({ name: label, screenshot: `route-${String(i).padStart(2, '0')}-${safe}.png`, loadMs })
    } catch (e) {
      report.pageErrors.push({ route: label, message: e.message })
    }
  }

  // 4) Test de scroll del sidebar (la corrección reciente)
  try {
    const aside = await page.$('aside')
    if (aside) {
      await page.evaluate(() => { document.querySelector('aside').scrollTop = 9999 })
      const before = await page.evaluate(() => document.querySelector('aside').scrollTop)
      const all = await page.$$('.nav-menu button')
      if (all.length > 0) {
        await all[Math.min(all.length - 1, 8)].click()
        await page.waitForTimeout(500)
        const after = await page.evaluate(() => document.querySelector('aside').scrollTop)
        report.scrollTest = { before, after, preserved: Math.abs(before - after) < 5 }
      }
    }
  } catch (e) {
    report.scrollTest = { error: e.message }
  }

  await browser.close()
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log('[OK] Inspección logueada lista. Reporte en inspection/out/report.json')
})().catch(err => {
  console.error('FATAL', err)
  process.exit(1)
})
