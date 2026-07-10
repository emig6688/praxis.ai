"""
Hace busqueda en Emitidos y muestra los botones de descarga disponibles.
"""
CUIT = "20144085672"
PASSWORD = input("Contrasena AFIP: ").strip()
REPRESENTADO_TEXTO = "PARABIAGO"
FECHA_DESDE = "01/06/2026"
FECHA_HASTA = "30/06/2026"

from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Login
        page.goto("https://auth.afip.gob.ar/contribuyente_/login.xhtml", timeout=30000)
        page.wait_for_load_state("networkidle")
        page.fill('[id="F1:username"]', CUIT)
        page.click('[id="F1:btnSiguiente"]')
        page.wait_for_selector('[id="F1:password"]', timeout=15000)
        page.fill('[id="F1:password"]', PASSWORD)
        page.click('[id="F1:btnIngresar"]')
        page.wait_for_load_state("networkidle", timeout=30000)
        page.wait_for_timeout(5000)
        print("Login OK")

        # Click Mis Comprobantes
        for el in page.locator("a").all():
            try:
                if el.inner_text(timeout=300).strip() == "Mis Comprobantes":
                    with context.expect_page() as np:
                        el.click()
                    mc = np.value
                    mc.wait_for_load_state("networkidle", timeout=20000)
                    mc.wait_for_timeout(3000)
                    break
            except Exception:
                pass

        # Seleccionar representado
        for el in mc.locator("a").all():
            try:
                if REPRESENTADO_TEXTO.upper() in el.inner_text(timeout=300).upper():
                    el.click()
                    mc.wait_for_load_state("networkidle", timeout=10000)
                    mc.wait_for_timeout(2000)
                    print(f"Representado seleccionado. URL: {mc.url}")
                    break
            except Exception:
                pass

        # Click Emitidos
        mc.click("#btnEmitidos")
        mc.wait_for_load_state("networkidle", timeout=15000)
        mc.wait_for_timeout(3000)
        print(f"Emitidos. URL: {mc.url}")

        # Intentar llenar el campo fecha con daterangepicker
        print(f"Llenando fecha: {FECHA_DESDE} - {FECHA_HASTA}")
        try:
            # Click en el campo fecha para abrir el picker
            fecha_input = mc.locator("#fechaEmision")
            fecha_input.click()
            mc.wait_for_timeout(1000)
            # Intentar llenar directamente
            fecha_input.fill(f"{FECHA_DESDE} - {FECHA_HASTA}")
            mc.keyboard.press("Escape")
            mc.wait_for_timeout(500)
            print(f"  Valor ingresado en fechaEmision")
        except Exception as e:
            print(f"  Error llenando fecha: {e}")

        # Click BUSCAR
        print("Clickeando BUSCAR...")
        mc.click("#buscarComprobantes")
        mc.wait_for_load_state("networkidle", timeout=20000)
        mc.wait_for_timeout(4000)
        print(f"Despues de BUSCAR. URL: {mc.url}")

        print("\n=== ELEMENTOS DESPUES DE BUSCAR ===")
        for el in mc.locator("a, button, input[type='submit'], input[type='button']").all():
            try:
                text = (el.inner_text(timeout=400) or el.get_attribute("value") or "").strip()
                href = el.get_attribute("href") or ""
                eid = el.get_attribute("id") or ""
                ecls = el.get_attribute("class") or ""
                if text and len(text) > 1:
                    print(f"  text='{text[:70]}' id='{eid}' href='{href[:60]}' class='{ecls[:40]}'")
            except Exception:
                pass

        # Ver si hay tabla de resultados
        print("\n=== TABLAS ===")
        for el in mc.locator("table").all():
            try:
                eid = el.get_attribute("id") or ""
                ecls = el.get_attribute("class") or ""
                rows = el.locator("tr").count()
                print(f"  table id='{eid}' class='{ecls}' rows={rows}")
            except Exception:
                pass

        input("\nPresiona Enter para cerrar...")
        browser.close()

main()
