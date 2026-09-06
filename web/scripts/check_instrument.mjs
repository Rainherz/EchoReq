/**
 * Verifica los invariantes que sostienen la medición del estudio.
 *
 * 1. Cada propuesta lleva su propio `presentedAt`.
 * 2. El editor no arrastra el borrador de una propuesta a la siguiente.
 *
 * Existe porque ya se rompió una vez sin que nada avisara. La pantalla de
 * descubrimiento fijaba un solo instante al montarse, así que el intervalo
 * que se registraba no era la latencia de cada decisión sino el tiempo
 * transcurrido desde que se abrió la pantalla. Los datos parecían válidos.
 *
 * Las decisiones se interceptan y se responden con un 201 falso: la prueba
 * lee lo que el cliente manda sin escribir nada en la base.
 *
 *   make timing
 *   cd web && node scripts/check_timing.mjs [--url http://localhost:5180]
 */
import { chromium } from "playwright";

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:5180";

const LECTURA_MS = 1500;

const browser = await chromium.launch();
const page = await browser.newPage();
const enviadas = [];
let falso = 90000;

await page.route("**/api/review-decisions", async (route) => {
  enviadas.push(route.request().postDataJSON());
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ id: falso++, seconds: 1.0 }),
  });
});

let fallas = 0;

async function comprobar(nombre, ruta, accion) {
  enviadas.length = 0;
  await page.goto(`${url}/${ruta}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  await accion();

  const distintos = new Set(enviadas.map((d) => d.presentedAt)).size;
  const ok = enviadas.length > 1 && distintos === enviadas.length;
  if (!ok) fallas += 1;

  console.log(`${ok ? "  ✓" : "  ✗"} ${nombre}: ${enviadas.length} decisiones, ${distintos} relojes distintos`);
  for (const d of enviadas) {
    const seg = (new Date(d.decidedAt) - new Date(d.presentedAt)) / 1000;
    console.log(`      ${d.proposalId} · ${seg.toFixed(1)}s`);
  }
}

console.log("· cada propuesta lleva su propio reloj\n");

// Entrar a un proyecto con cola pendiente.
await page.goto(url);
await page.waitForLoadState("networkidle");
await page.getByText("Clínica Norte").first().click();
await page.waitForLoadState("networkidle");

await comprobar("revisión · una por vez", "#review", async () => {
  for (let i = 0; i < 3; i++) {
    const boton = page.getByRole("button", { name: "Aceptar" });
    if ((await boton.count()) === 0) break;
    await page.waitForTimeout(LECTURA_MS);
    await boton.first().click();
    await page.waitForTimeout(400);
  }
});

await comprobar("descubrimiento · todas a la vista", "#discovery", async () => {
  const tarjetas = page.locator("div.candidate");
  for (let i = 0; i < 3; i++) {
    const tarjeta = tarjetas.nth(i);
    if ((await tarjeta.count()) === 0) break;
    await tarjeta.click({ force: true });
    await page.waitForTimeout(LECTURA_MS);
    const aceptar = tarjeta.getByRole("button", { name: "Aceptar" });
    if ((await aceptar.count()) === 0) continue;
    await aceptar.first().click();
    await page.waitForTimeout(400);
  }
});

// El borrador del editor no puede sobrevivir al avance: si sobrevive, la
// propuesta siguiente queda registrada con una edición que el revisor nunca
// escribió para ella, y el texto queda idéntico en toda la cola.
enviadas.length = 0;
await page.goto(`${url}/#review`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);

const editar = page.getByRole("button", { name: "Editar" });
if ((await editar.count()) > 0) {
  await editar.click();
  await page.waitForTimeout(300);
  await page.locator("#proposal-editor").fill("EDICION DE LA PRIMERA");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.waitForTimeout(800);

  const arrastra = (await page.locator("#proposal-editor").count()) > 0;
  if (arrastra) fallas += 1;
  console.log(`\n${arrastra ? "  ✗" : "  ✓"} el editor no arrastra el borrador a la siguiente`);
} else {
  console.log("\n  · sin cola para probar el editor");
}

await browser.close();

console.log(
  fallas === 0
    ? "\nla pantalla registra lo que el revisor hizo, y nada más"
    : `\n${fallas} invariante(s) rotos: lo registrado no refleja lo que el revisor hizo`,
);
process.exit(fallas === 0 ? 0 : 1);
