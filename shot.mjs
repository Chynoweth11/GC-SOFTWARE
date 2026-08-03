import { chromium } from 'playwright'
const dir = '/tmp/claude-0/-home-user-GC-SOFTWARE/5c77a994-65b0-557f-a97f-ca4e192b257d/scratchpad'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE ERROR:', m.text()) })
page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
await page.fill('#email','owner@constructx.com'); await page.fill('#password','constructx')
await Promise.all([page.waitForURL('http://localhost:3000/', {timeout: 60000}), page.click('button[type=submit]')])
await page.waitForTimeout(2500)
const targets = process.argv.slice(2)
for (const t of targets.length ? targets : ['/']) {
  const url = 'http://localhost:3000' + t
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const name = t.replace(/[/?=&]/g,'_') || 'root'
  await page.screenshot({ path: `${dir}/shot${name}.png`, fullPage: true })
  console.log('shot', url)
}
await browser.close()
