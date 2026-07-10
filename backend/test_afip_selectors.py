import asyncio
asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

async def test():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', timeout=20000)

        # Paso 1: ingresar CUIT sin guiones
        await page.fill('[id="F1:username"]', '20338310723')
        await page.click('[id="F1:btnSiguiente"]')
        await page.wait_for_load_state('networkidle', timeout=10000)

        print("== Campos despues de ingresar CUIT ==")
        inputs = await page.query_selector_all('input')
        for i in inputs:
            id_attr = await i.get_attribute('id')
            type_attr = await i.get_attribute('type')
            if type_attr != 'hidden':
                print(f'  input id={id_attr} type={type_attr}')

        buttons = await page.query_selector_all('button, input[type=submit]')
        for b in buttons:
            bid = await b.get_attribute('id')
            txt = await b.inner_text()
            print(f'  button id={bid} text={repr(txt)}')

        await browser.close()

asyncio.run(test())
